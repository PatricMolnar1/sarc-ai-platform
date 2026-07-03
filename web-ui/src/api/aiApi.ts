/**
 * AI Worker client (FastAPI, port 8000).
 *
 * Drives the full pipeline flow: upload a DICOM series, open the run WebSocket
 * (which triggers the pipeline and streams progress), fetch the resulting
 * `.npy` arrays, and tell the worker to clean up. The AI Worker has no patient
 * identity and never touches the Core Backend; results are carried back through
 * this client and persisted separately via the Core API.
 */

import { AI_API_BASE } from "./config";
import { parseNpy } from "../utils/npy";
import type { MaskVolume, SliceVolume } from "./types";

/** `{ task_id, file_count }` from `POST /api/upload`. */
export interface UploadResult {
  taskId: string;
  fileCount: number;
}

/**
 * `COMPLETE` frame payload. The worker emits snake_case.
 * `best_slice_index` is the index within `slices.npy` (0..N-1) of the
 * max-muscle-area slice, computed by the worker; the viewer opens there and the
 * Core Backend re-derives the authoritative value on Save.
 */
export interface PipelineComplete {
  task_id: string;
  muscle_area: number;
  slice_count: number;
  best_slice_index: number;
}

export interface RunHandlers {
  /** A `LOG` frame: one human-readable pipeline step message. */
  onLog: (message: string) => void;
  /** Terminal success: the pipeline finished and arrays are ready to fetch. */
  onComplete: (result: PipelineComplete) => void;
  /** Terminal failure: an `ERROR` frame or a transport/socket error. */
  onError: (message: string) => void;
}

/** Handle to an in-flight pipeline run; call {@link cancel} to close the socket. */
export interface RunHandle {
  cancel: () => void;
}

type WsFrame =
  | { type: "LOG"; payload: string }
  | { type: "COMPLETE"; payload: PipelineComplete }
  | { type: "ERROR"; payload: string };

/** Build the WebSocket URL for the run endpoint, resolving the dev-proxy base. */
function runSocketUrl(taskId: string): string {
  const path = `/ws/run/${encodeURIComponent(taskId)}`;

  // Absolute base (e.g. prod "http://worker:8000"): swap the scheme to ws/wss.
  if (/^https?:\/\//.test(AI_API_BASE)) {
    return AI_API_BASE.replace(/^http/, "ws") + path;
  }
  // Relative base (dev "/ai"): connect to the Vite dev server, which proxies ws.
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${AI_API_BASE}${path}`;
}

async function fetchVolume(taskId: string, filename: string): Promise<ArrayBuffer> {
  const res = await fetch(`${AI_API_BASE}/temp/${encodeURIComponent(taskId)}/${filename}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
  }
  return res.arrayBuffer();
}

export const aiApi = {
  /** Upload a DICOM series; returns the task id the rest of the flow keys off. */
  async upload(files: File[]): Promise<UploadResult> {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const res = await fetch(`${AI_API_BASE}/api/upload`, { method: "POST", body: form });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Upload failed: ${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
    }
    const json = (await res.json()) as { task_id: string; file_count: number };
    return { taskId: json.task_id, fileCount: json.file_count };
  },

  /**
   * Open the run WebSocket; connecting triggers the pipeline. Streams `LOG`
   * frames until a terminal `COMPLETE` or `ERROR`, then closes. Returns a handle
   * so the caller can cancel (e.g. on dialog close).
   */
  run(taskId: string, handlers: RunHandlers): RunHandle {
    const socket = new WebSocket(runSocketUrl(taskId));
    let settled = false;

    socket.onmessage = (event) => {
      let frame: WsFrame;
      try {
        frame = JSON.parse(event.data as string) as WsFrame;
      } catch {
        handlers.onLog(String(event.data));
        return;
      }
      if (frame.type === "LOG") {
        handlers.onLog(frame.payload);
      } else if (frame.type === "COMPLETE") {
        settled = true;
        handlers.onComplete(frame.payload);
      } else if (frame.type === "ERROR") {
        settled = true;
        handlers.onError(frame.payload);
      }
    };

    socket.onerror = () => {
      if (!settled) handlers.onError("WebSocket connection error.");
    };

    socket.onclose = (event) => {
      // A close before any terminal frame means the run was interrupted.
      if (!settled) handlers.onError(event.reason || "Connection closed before the pipeline finished.");
    };

    return {
      cancel: () => {
        settled = true; // suppress the onclose error for an intentional cancel
        socket.close();
      },
    };
  },

  async fetchSlices(taskId: string): Promise<SliceVolume> {
    const arr = parseNpy(await fetchVolume(taskId, "slices.npy"));
    return { shape: arr.shape as [number, number, number], data: arr.data as Float32Array };
  },

  async fetchMasks(taskId: string): Promise<MaskVolume> {
    const arr = parseNpy(await fetchVolume(taskId, "masks.npy"));
    return { shape: arr.shape as [number, number, number], data: arr.data as Uint8Array };
  },

  /** Tell the worker to delete the task directory once both arrays are fetched. */
  async cleanup(taskId: string): Promise<void> {
    const res = await fetch(`${AI_API_BASE}/api/cleanup/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Cleanup failed: ${res.status} ${res.statusText}`);
    }
  },
};
