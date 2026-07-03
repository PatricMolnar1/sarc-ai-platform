# Sarcopenia Detection System

AI-assisted detection of **sarcopenia** (age-related skeletal-muscle loss) from abdominal MRI scans. The system automatically segments skeletal muscle at the **L3 vertebra**, computes muscle-area metrics, and hands a radiologist a doctor-in-the-loop interface to review, edit, and persist the result to a patient record.

> Engineering license (Bachelor's thesis) project — Patric-Gheorghe Molnar, Technical University of Cluj-Napoca.

---

## What it does

1. A doctor uploads a DICOM MRI series for a patient.
2. The **AI Worker** runs the full sarcopenia pipeline (DICOM → NIfTI → spine segmentation → L3 localisation → resampling → muscle inference) and streams live progress logs.
3. The **Web UI** renders the preprocessed slices with the predicted muscle mask, opening on the best L3 slice, and lets the doctor edit the mask with a brush/eraser.
4. On **Keep & save**, the **Core Backend** re-derives the authoritative metrics (best slice, muscle area, preview thumbnail) and stores the result in PostgreSQL against the patient record.

## Architecture

The system uses a **Decoupled Staging Pattern**: the AI Worker and Core Backend never talk to each other. The Web UI is the single orchestrator — it drives the AI Worker for all computation and only contacts the Core Backend on an explicit Save.

```
┌──────────────────────────────────────────────────────────────┐
│                        Docker Network                        │
│                                                              │
│  ┌───────────────┐                       ┌───────────────┐   │
│  │  AI Worker    │◄─--upload/WS/fetch---►│    Web UI     │   │
│  │  FastAPI      │                       │  React/Vite   │   │
│  │  :8000 (GPU)  │                       │  :3000        │   │
│  └───────────────┘                       └───────┬───────┘   │
│                                              Save only       │
│                                                  ▼           │
│                                        ┌───────────────┐     │
│                                        │ Core Backend  │     │
│                                        │  Spring Boot  │     │
│                                        │  :8080        │     │
│                                        └───────┬───────┘     │
│                                          ┌─────▼─────┐       │
│                                          │ PostgreSQL│       │
│                                          └───────────┘       │
└──────────────────────────────────────────────────────────────┘
```

See [Plan.md](Plan.md) for the full architecture, API contracts, and data flow, and [Status.md](Status.md) for current implementation status.

## Services

| Service | Directory | Stack | Port |
| ------- | --------- | ----- | ---- |
| **AI Worker** | [`PythonFastAPIWebApp/`](PythonFastAPIWebApp/) | Python 3.11, FastAPI, PyTorch 2.2 (CUDA), SimpleITK, TotalSpineSeg | 8000 |
| **Core Backend** | [`main-backend/`](main-backend/) | Java 21, Spring Boot 3.4, JPA/Hibernate | 8080 |
| **Web UI** | [`web-ui/`](web-ui/) | React 18, Vite, TypeScript, MUI 6 | 3000 |
| **Database** | — | PostgreSQL 16 | 5432 |

## AI Pipeline

The segmentation pipeline runs in six modular, framework-free steps:

| # | Step | Output |
| - | ---- | ------ |
| 1 | DICOM → NIfTI | `volume.nii.gz` |
| 2 | Spine segmentation (TotalSpineSeg) | labelled vertebra volume |
| 3 | L3 localisation | L3 mid-slice index + spinal-cord centroid |
| 4 | Resampling | volume at 1.0 × 1.0 × 3.0 mm spacing |
| 5 | Crop + inference | `slices.npy`, `masks.npy` `(N, 256, 256)` |
| 6 | Muscle area | best-slice skeletal-muscle area (cm²) |

**Model:** U-Net with a ResNet34 encoder, 2.5D input (a slice triplet N−1, N, N+1), single-class binary skeletal-muscle output.

## Quick start

```bash
# 1. Core Backend + PostgreSQL (builds the image, seeds 4 demo patients)
docker compose up --build -d

# 2. AI Worker (needs an NVIDIA GPU; drop --gpus all to run on CPU)

# 2.1 On first startup (Image building and container creation)
docker build -t sarco-ai-worker ./PythonFastAPIWebApp
docker run -d --name sarco-ai-worker --gpus all --shm-size=8g -p 8000:8000 sarco-ai-worker

# 2.2 On subsequent startups
docker start sarco-ai-worker

# 3. Web UI
cd web-ui
npm install
npm run dev
```

Then open **http://localhost:3000**.

### Prerequisites

- Docker Desktop
- Node.js (for the Web UI)
- For GPU inference: an NVIDIA GPU + the NVIDIA Container Toolkit (on Windows: Docker Desktop with the WSL2 backend). Without it the AI Worker still runs on CPU, just slowly.

> `--shm-size=8g` is **required** for the AI Worker — TotalSpineSeg's nnU-Net workers exchange volumes through `/dev/shm`, and Docker's 64 MB default overflows them.

## Project status

- **Core Backend** — implemented and verified end-to-end (all contract endpoints exercised over HTTP).
- **AI Worker** — full API and pipeline implemented; runs with model weights and the `totalspineseg` CLI baked into the image.
- **Web UI** — dashboard, patient management, live pipeline console, and canvas mask editor implemented.

Known gaps: no authentication yet, CORS is dev-scoped, and the AI Worker / Web UI are not yet part of `docker-compose.yml`. See [Status.md](Status.md) for the detailed breakdown.

## Credits

Spine segmentation and L3 localisation (pipeline Step 2) are performed by
[**TotalSpineSeg**](https://github.com/neuropoly/totalspineseg), used as an
external CLI. TotalSpineSeg is released under the LGPL-3.0 license and is
built on [nnU-Net](https://github.com/MIC-DKFZ/nnUNet).

If you use this project in academic work, please cite:

- Warszawer, Y., Molinier, N., et al. *TotalSpineSeg: Robust Spine
  Segmentation with Landmark-Based Labeling in MRI* (2025).
- Isensee, F., Jaeger, P. F., Kohl, S. A., Petersen, J., & Maier-Hein, K. H.
  *nnU-Net: a self-configuring method for deep learning-based biomedical
  image segmentation.* Nature Methods (2021).

## Disclaimer

This is an academic research prototype and is **not** a medical device. It must not be used for clinical diagnosis or treatment decisions.
