"""Sarcopenia detection inference pipeline.

This module contains the pure computation half of the AI Worker. It takes a raw
DICOM series, runs the full sarcopenia pipeline (DICOM -> NIfTI, spine
segmentation, L3 localisation, resampling, crop, 2.5D U-Net inference) and
writes the `slices.npy` / `masks.npy` arrays the UI consumes.

The entry point is `run_sarcopenia_detection(...)`. It is deliberately free of
any web-framework concerns: progress is reported through an injected `log`
callback so it can be driven equally well from a CLI, a test, or the FastAPI
WebSocket endpoint. The heavy model is loaded once and cached via
`get_pipeline()`.
"""

from __future__ import annotations

import glob
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from typing import Callable, Iterable, List, Optional, Sequence

import numpy as np
import SimpleITK as sitk
import dicom2nifti
import dicom2nifti.settings as dicom2nifti_settings
import segmentation_models_pytorch as smp
import torch

# Real-world clinical CT routinely trips dicom2nifti's strict validation
# (uneven slice spacing, gantry tilt). Relax the checks that have safe
# remedies so a recoverable series doesn't silently yield zero output.
dicom2nifti_settings.disable_validate_slice_increment()
dicom2nifti_settings.enable_resampling()
dicom2nifti_settings.set_resample_padding(-1000)  # air HU for tilt-correction fill

# Configuration

APP_DIR = os.path.dirname(os.path.abspath(__file__))

# 2.5D U-Net weights; overridable via env for tests/ops.
MODEL_PATH = os.environ.get(
    "SARCOPENIA_MODEL_PATH", os.path.join(APP_DIR, "models", "sarcopenia_2_5D_model.pth")
)

# TotalSpineSeg is an external CLI. On the container it lives on PATH as
# `totalspineseg`; on a local Windows venv it is `venv/Scripts/totalspineseg.exe`.
SPINESEG_EXE = os.environ.get("SARCOPENIA_SPINESEG_EXE", "totalspineseg")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# TotalSpineSeg runs as a separate process; let it follow the same device unless
# explicitly overridden (SARCOPENIA_SPINESEG_DEVICE = cuda | cpu | auto).
_SPINESEG_ENV = os.environ.get("SARCOPENIA_SPINESEG_DEVICE", "").strip().lower()
if _SPINESEG_ENV in ("cuda", "cpu"):
    SPINESEG_DEVICE = _SPINESEG_ENV
elif _SPINESEG_ENV in ("", "auto"):
    SPINESEG_DEVICE = DEVICE
else:
    raise ValueError("SARCOPENIA_SPINESEG_DEVICE must be 'cuda', 'cpu', or 'auto' (or unset).")

# TotalSpineSeg's nnU-Net auto-sizes its worker pool to min(cpu_count, RAM_GB/8),
# which overshoots a memory-limited container and gets the preprocessing workers
# OOM-killed ("Background workers died"). Cap both pools (override via env); 1 is
# the safe default that trades speed for staying within the memory budget.
SPINESEG_MAX_WORKERS = os.environ.get("SARCOPENIA_SPINESEG_MAX_WORKERS", "1")
SPINESEG_MAX_WORKERS_NNUNET = os.environ.get("SARCOPENIA_SPINESEG_MAX_WORKERS_NNUNET", "1")

# Geometry constants (kept identical to the trained pipeline).
RESAMPLE_SPACING = (1.0, 1.0, 3.0)  # SimpleITK (x, y, z) mm
CROP_SIZE = 256
L3_LABEL = 43          # TotalSpineSeg label for the L3 vertebra
SPINAL_CORD_LABEL = 2  # TotalSpineSeg label for the spinal cord

# With 1.0 x 1.0 mm in-plane resampling each pixel covers 1 mm^2.
PIXEL_AREA_MM2 = RESAMPLE_SPACING[0] * RESAMPLE_SPACING[1]

LogFn = Callable[[str], None]


def _noop_log(_message: str) -> None:
    """Default log sink used when the caller does not provide one."""


# Image helpers (unchanged numerics from the trained pipeline).

def resample_mri(img: sitk.Image, new_spacing=RESAMPLE_SPACING, is_label: bool = False) -> sitk.Image:
    spacing = img.GetSpacing()
    size = img.GetSize()
    new_size = [int(round(sz * sp / nsp)) for sz, sp, nsp in zip(size, spacing, new_spacing)]
    resampler = sitk.ResampleImageFilter()
    resampler.SetOutputSpacing(new_spacing)
    resampler.SetSize(new_size)
    resampler.SetOutputDirection(img.GetDirection())
    resampler.SetOutputOrigin(img.GetOrigin())
    resampler.SetInterpolator(sitk.sitkNearestNeighbor if is_label else sitk.sitkBSpline)
    return resampler.Execute(img)


def normalize_mri(img_np: np.ndarray) -> np.ndarray:
    p1, p99 = np.percentile(img_np, (1, 99))
    img_np = np.clip(img_np, p1, p99)
    return ((img_np - p1) / (p99 - p1 + 1e-8)).astype(np.float32)


def crop_center(slice_np: np.ndarray, cy: int, cx: int, size: int = CROP_SIZE) -> np.ndarray:
    h, w = slice_np.shape
    y1, y2 = cy - size // 2, cy + size // 2
    x1, x2 = cx - size // 2, cx + size // 2
    pad_y1, pad_y2 = max(0, -y1), max(0, y2 - h)
    pad_x1, pad_x2 = max(0, -x1), max(0, x2 - w)
    crop = slice_np[max(0, y1):min(h, y2), max(0, x1):min(w, x2)]
    return np.pad(crop, ((pad_y1, pad_y2), (pad_x1, pad_x2)), mode="constant")


# Result container

@dataclass
class PipelineResult:
    """Everything the API layer needs to build a COMPLETE payload."""

    slices_path: str
    masks_path: str
    slice_count: int
    areas_px: List[float] = field(default_factory=list)  # per-slice muscle pixels
    best_slice_index: int = 0
    pixel_area_mm2: float = PIXEL_AREA_MM2

    @property
    def best_area_px(self) -> float:
        return self.areas_px[self.best_slice_index] if self.areas_px else 0.0

    @property
    def muscle_area_cm2(self) -> float:
        """Cross-sectional muscle area of the best L3 slice, in cm^2."""
        return self.best_area_px * self.pixel_area_mm2 / 100.0


# Model wrapper (loaded once).

class SarcopeniaPipeline:
    """Holds the loaded U-Net and drives the six pipeline steps."""

    def __init__(self, model_path: str = MODEL_PATH):
        self.model = smp.Unet("resnet34", encoder_weights=None, in_channels=3, classes=1).to(DEVICE)
        self.model.load_state_dict(torch.load(model_path, map_location=DEVICE, weights_only=True))
        self.model.eval()
        self.model_path = model_path

    # Step 1
    def _dicom_to_nifti(self, dicom_dir: str, working_dir: str, log: LogFn) -> str:
        log("[Step 1/6] Converting DICOM series to NIfTI...")
        nifti_path = os.path.join(working_dir, "volume.nii.gz")

        # convert_directory swallows per-series conversion errors and only logs
        # them, so attach a handler to dicom2nifti's logger to relay the real
        # reason a series was rejected back to the UI.
        captured: List[str] = []
        handler = logging.Handler()
        handler.emit = lambda record: captured.append(record.getMessage())
        d2n_logger = logging.getLogger("dicom2nifti")
        d2n_logger.addHandler(handler)
        prev_level = d2n_logger.level
        d2n_logger.setLevel(logging.INFO)
        try:
            dicom2nifti.convert_directory(dicom_dir, working_dir, compression=True)
        finally:
            d2n_logger.removeHandler(handler)
            d2n_logger.setLevel(prev_level)

        produced = glob.glob(os.path.join(working_dir, "*.nii.gz"))
        if not produced:
            detail = next((m for m in captured if m), "")
            for line in captured:
                log(f"    dicom2nifti: {line}")
            msg = "DICOM to NIfTI conversion produced no volume."
            if detail:
                msg += f" ({detail})"
            raise PipelineError(msg)

        # A folder may hold several series (scouts, sagittal/coronal reformats);
        # the axial body series we need is the one with the most slices, so pick
        # the largest output rather than an arbitrary one.
        if len(produced) > 1:
            log(f"    - {len(produced)} series converted; selecting the largest.")
        largest = max(produced, key=os.path.getsize)
        os.replace(largest, nifti_path)
        log("    - NIfTI volume created.")
        return nifti_path

    # Step 2
    def _run_spineseg(self, nifti_path: str, working_dir: str, log: LogFn) -> str:
        log("[Step 2/6] Running TotalSpineSeg (Spine & Spinal Cord)...")
        spine_out_dir = os.path.join(working_dir, "spine_mask")
        os.makedirs(spine_out_dir, exist_ok=True)
        log(f"    - TotalSpineSeg device: {SPINESEG_DEVICE}")

        process = subprocess.run(
            [
                SPINESEG_EXE, nifti_path, spine_out_dir,
                "--device", SPINESEG_DEVICE,
                "--max-workers", SPINESEG_MAX_WORKERS,
                "--max-workers-nnunet", SPINESEG_MAX_WORKERS_NNUNET,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if process.stdout:
            log("    TotalSpineSeg stdout:")
            log(process.stdout)
        if process.stderr:
            log("    TotalSpineSeg stderr:")
            log(process.stderr)
        if process.returncode != 0:
            raise PipelineError(f"TotalSpineSeg failed with exit code {process.returncode}.")

        matches = glob.glob(os.path.join(spine_out_dir, "step2_output", "*.nii.gz"))
        if not matches:
            raise PipelineError("TotalSpineSeg failed to produce step2 output.")
        log("    - Spine segmentation complete.")
        return matches[0]

    # Steps 3-5
    def _segment_l3(self, nifti_path: str, spine_mask_path: str, log: LogFn):
        log("[Step 3/6] Loading volumes and resampling to 1x1mm...")
        img_np = sitk.GetArrayFromImage(resample_mri(sitk.ReadImage(nifti_path), is_label=False))
        spine_np = sitk.GetArrayFromImage(resample_mri(sitk.ReadImage(spine_mask_path), is_label=True))
        log(f"    - Resampling done. Current shape: {img_np.shape}")

        log("[Step 4/6] Isolating L3 region and cropping center...")
        z_indices = np.where(np.sum(spine_np == L3_LABEL, axis=(1, 2)) > 0)[0]
        if len(z_indices) == 0:
            raise PipelineError("L3 vertebra (label 43) not detected in the volume.")
        log(f"    - Found L3 across {len(z_indices)} slices.")

        processed_slices = []
        for z in z_indices:
            coords = np.where(spine_np[z] == SPINAL_CORD_LABEL)
            if len(coords[0]) == 0:
                continue
            cy, cx = int(coords[0].mean()), int(coords[1].mean())
            processed_slices.append(crop_center(img_np[z], cy, cx))
        if not processed_slices:
            raise PipelineError("Could not find spinal cord center for cropping.")

        stack = normalize_mri(np.stack(processed_slices))
        log("    - Stack normalized and cropped to 256x256.")
        return stack

    def _infer(self, stack: np.ndarray, log: LogFn):
        log("[Step 5/6] Running U-Net inference on 2.5D triplets...")
        if len(stack) < 3:
            raise PipelineError(
                f"Need at least 3 L3 slices for 2.5D inference; got {len(stack)}."
            )

        final_masks: List[np.ndarray] = []
        areas: List[float] = []
        with torch.no_grad():
            for i in range(1, len(stack) - 1):
                triplet = stack[i - 1:i + 2]
                input_tensor = torch.from_numpy(triplet).unsqueeze(0).to(DEVICE)
                output = torch.sigmoid(self.model(input_tensor))
                mask = (output > 0.5).cpu().numpy().squeeze().astype(np.uint8)
                final_masks.append(mask)
                areas.append(float(mask.sum()))
                log(f"    - Slice {i}/{len(stack) - 2}: {areas[-1]:.0f} muscle px")

        final_images = stack[1:-1].astype(np.float32)
        return final_images, np.stack(final_masks).astype(np.uint8), areas

    # Orchestration
    def process_series(self, dicom_dir: str, output_dir: str, log: LogFn = _noop_log) -> PipelineResult:
        """Run all six steps; write slices.npy / masks.npy into `output_dir`."""
        os.makedirs(output_dir, exist_ok=True)
        working_dir = tempfile.mkdtemp(prefix="sarco_", dir=output_dir)
        try:
            nifti_path = self._dicom_to_nifti(dicom_dir, working_dir, log)
            spine_mask_path = self._run_spineseg(nifti_path, working_dir, log)
            stack = self._segment_l3(nifti_path, spine_mask_path, log)
            final_images, final_masks, areas = self._infer(stack, log)

            log("[Step 6/6] Saving outputs to disk...")
            slices_path = os.path.join(output_dir, "slices.npy")
            masks_path = os.path.join(output_dir, "masks.npy")
            np.save(slices_path, final_images)
            np.save(masks_path, final_masks)
            log(f"    - Saved slices.npy and masks.npy to {output_dir}")

            best_idx = int(np.argmax(areas))
            log(
                f"FINISH: {len(final_images)} slices. "
                f"Max muscle area {areas[best_idx]:.0f} px at slice {best_idx}."
            )
            return PipelineResult(
                slices_path=slices_path,
                masks_path=masks_path,
                slice_count=len(final_images),
                areas_px=areas,
                best_slice_index=best_idx,
            )
        finally:
            shutil.rmtree(working_dir, ignore_errors=True)


class PipelineError(RuntimeError):
    """Raised for any expected, reportable pipeline failure."""


# Cached model and public entry point.

_PIPELINE: Optional[SarcopeniaPipeline] = None


def get_pipeline() -> SarcopeniaPipeline:
    """Lazily load and cache the U-Net so weights are read from disk only once."""
    global _PIPELINE
    if _PIPELINE is None:
        _PIPELINE = SarcopeniaPipeline(MODEL_PATH)
    return _PIPELINE


def _stage_dicoms(dicoms: Sequence[str], staging_dir: str) -> str:
    """Copy a list of DICOM file paths into a flat directory for conversion."""
    series_dir = os.path.join(staging_dir, "series")
    os.makedirs(series_dir, exist_ok=True)
    for index, src in enumerate(dicoms):
        if not os.path.isfile(src):
            raise PipelineError(f"DICOM path does not exist: {src}")
        name = os.path.basename(src) or f"slice_{index:04d}.dcm"
        shutil.copy2(src, os.path.join(series_dir, name))
    return series_dir


def run_sarcopenia_detection(
    dicoms: Iterable[str],
    output_dir: str,
    log: LogFn = _noop_log,
) -> PipelineResult:
    """Run the full sarcopenia pipeline over a DICOM series.

    Args:
        dicoms: Either a single directory path containing the DICOM series, or
            an iterable of individual DICOM file paths.
        output_dir: Where `slices.npy` and `masks.npy` are written (typically
            `uploaded_dicoms/{task_id}/`).
        log: Optional callback invoked with each human-readable progress line.

    Returns:
        A `PipelineResult` describing the written arrays and L3 muscle metrics.
    """
    pipeline = get_pipeline()

    # Accept either a directory or a list of file paths.
    if isinstance(dicoms, str):
        dicom_dir = dicoms
        return pipeline.process_series(dicom_dir, output_dir, log)

    dicom_list = [p for p in dicoms]
    if len(dicom_list) == 1 and os.path.isdir(dicom_list[0]):
        return pipeline.process_series(dicom_list[0], output_dir, log)
    if not dicom_list:
        raise PipelineError("No DICOM files provided.")

    staging_dir = tempfile.mkdtemp(prefix="sarco_stage_")
    try:
        series_dir = _stage_dicoms(dicom_list, staging_dir)
        return pipeline.process_series(series_dir, output_dir, log)
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)
