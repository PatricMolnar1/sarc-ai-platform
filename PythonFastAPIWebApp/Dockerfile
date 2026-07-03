# We use 3.11 for stability with Torch and Triton
FROM python:3.11-slim

# Install system dependencies for medical image processing (DICOM/OpenCV).
# curl is used at build time to fetch the TotalSpineSeg weights with retry+resume.
RUN apt-get update && apt-get install -y \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry inside the container
RUN pip install "poetry>=1.8.0"

WORKDIR /app

# Copy the "DNA" of your environment
COPY pyproject.toml poetry.lock ./

# Install dependencies into the container's system python
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-root

# Copy your source code
COPY . .

# Bake the TotalSpineSeg weights into the image so segmentation never has to hit
# the network at runtime. We fetch the release archives with curl (retry+resume),
# then let totalspineseg_init extract them from the exports folder. Doing this at
# build time turns a flaky per-container runtime download into a one-time,
# verifiable build step. The exports zips are removed afterwards to keep the image
# lean; the extracted results/ is what inference actually reads.
ENV TOTALSPINESEG_DATA=/opt/totalspineseg
RUN python prefetch_weights.py \
    && totalspineseg_init --data-dir "$TOTALSPINESEG_DATA" --quiet \
    && test -n "$(ls -A "$TOTALSPINESEG_DATA/nnUNet/results" 2>/dev/null)" \
    && rm -rf "$TOTALSPINESEG_DATA/nnUNet/exports"

# Unbuffered logs so you see your AI training/inference output in real-time
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]