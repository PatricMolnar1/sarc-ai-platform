"""AI Worker: FastAPI service.

Computation-only worker. Accepts a raw DICOM series, runs the sarcopenia
pipeline in a thread executor, streams progress over a WebSocket, and serves the
resulting `.npy` arrays for the UI to fetch. Holds no patient identity and never
talks to the Core Backend.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import uuid
from typing import List

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from pipeline import PipelineError, PipelineResult, get_pipeline, run_sarcopenia_detection

APP_DIR = os.path.dirname(os.path.abspath(__file__))
# DICOM uploads and pipeline outputs share one task directory.
TASKS_DIR = os.environ.get("SARCOPENIA_TASKS_DIR", os.path.join(APP_DIR, "uploaded_dicoms"))
os.makedirs(TASKS_DIR, exist_ok=True)

app = FastAPI(title="Sarcopenia Detection AI Worker")


def _task_dir(task_id: str) -> str:
    """Resolve a task directory, rejecting anything that isn't a known task id."""
    try:
        # Reject path traversal: a task id must be a bare UUID.
        uuid.UUID(task_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Unknown task_id.")
    path = os.path.join(TASKS_DIR, task_id)
    return path


@app.get("/health")
def health():
    return {"status": "ok"}


# POST /api/upload

@app.post("/api/upload")
async def upload(files: List[UploadFile] = File(...)):
    """Persist an uploaded DICOM series under a fresh task id."""
    if not files:
        raise HTTPException(status_code=422, detail="No files uploaded.")

    task_id = str(uuid.uuid4())
    series_dir = os.path.join(TASKS_DIR, task_id)
    os.makedirs(series_dir, exist_ok=True)

    file_count = 0
    for index, upload_file in enumerate(files):
        # Flatten any client-supplied path; keep only a safe basename.
        base = os.path.basename(upload_file.filename or "") or f"slice_{index:04d}.dcm"
        dest = os.path.join(series_dir, base)
        with open(dest, "wb") as out:
            shutil.copyfileobj(upload_file.file, out)
        await upload_file.close()
        file_count += 1

    return {"task_id": task_id, "file_count": file_count}


# WebSocket /ws/run/{task_id}

@app.websocket("/ws/run/{task_id}")
async def run_pipeline(websocket: WebSocket, task_id: str):
    """Connecting triggers the pipeline; streams LOG / COMPLETE / ERROR frames."""
    await websocket.accept()

    try:
        uuid.UUID(task_id)
    except ValueError:
        await websocket.send_json({"type": "ERROR", "payload": "Unknown task_id."})
        await websocket.close()
        return

    series_dir = os.path.join(TASKS_DIR, task_id)
    if not os.path.isdir(series_dir):
        await websocket.send_json({"type": "ERROR", "payload": "Task directory not found."})
        await websocket.close()
        return

    loop = asyncio.get_running_loop()
    log_queue: asyncio.Queue = asyncio.Queue()

    def log(message: str) -> None:
        # Called from the worker thread; hop back onto the event loop safely.
        loop.call_soon_threadsafe(log_queue.put_nowait, message)

    def work() -> PipelineResult:
        return run_sarcopenia_detection(series_dir, series_dir, log=log)

    pipeline_task = loop.run_in_executor(None, work)

    # Drain log messages until the pipeline future resolves.
    try:
        while True:
            drain = asyncio.ensure_future(log_queue.get())
            done, _ = await asyncio.wait(
                {drain, pipeline_task}, return_when=asyncio.FIRST_COMPLETED
            )
            if drain in done:
                await websocket.send_json({"type": "LOG", "payload": drain.result()})
            else:
                drain.cancel()
            if pipeline_task in done:
                break

        # Flush any log messages that landed before the future resolved.
        while not log_queue.empty():
            await websocket.send_json({"type": "LOG", "payload": log_queue.get_nowait()})

        result = pipeline_task.result()
        await websocket.send_json(
            {
                "type": "COMPLETE",
                "payload": {
                    "task_id": task_id,
                    "muscle_area": round(result.muscle_area_cm2, 2),
                    "slice_count": result.slice_count,
                    # Index (within slices.npy, 0..N-1) of the max-muscle-area slice;
                    # the UI opens the viewer here. The Core Backend re-derives the
                    # authoritative value on Save.
                    "best_slice_index": result.best_slice_index,
                },
            }
        )
    except PipelineError as exc:
        await websocket.send_json({"type": "ERROR", "payload": str(exc)})
    except WebSocketDisconnect:
        return
    except Exception as exc:  # noqa: BLE001 - surface any unexpected failure to the UI
        await websocket.send_json({"type": "ERROR", "payload": f"Unexpected error: {exc}"})
    finally:
        await websocket.close()


# GET /temp/{task_id}/{slices,masks}.npy

@app.get("/temp/{task_id}/{filename}")
def get_array(task_id: str, filename: str):
    if filename not in ("slices.npy", "masks.npy"):
        raise HTTPException(status_code=404, detail="Unknown array.")
    path = os.path.join(_task_dir(task_id), filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Array not found.")
    return FileResponse(path, media_type="application/octet-stream", filename=filename)


# DELETE /api/cleanup/{task_id}

@app.delete("/api/cleanup/{task_id}")
def cleanup(task_id: str):
    path = _task_dir(task_id)
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Task not found.")
    shutil.rmtree(path, ignore_errors=True)
    return {"deleted": True}


@app.on_event("startup")
def _warm_model() -> None:
    """Load the U-Net once at startup so the first request isn't penalised.

    Best-effort: if weights are missing the worker still starts and serves
    /health; the pipeline will report the failure per-request.
    """
    try:
        get_pipeline()
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] Model not pre-loaded: {exc}")
