"""Pre-fetch the TotalSpineSeg model archives at image build time.

TotalSpineSeg downloads ~230 MB of nnU-Net weights from GitHub the first time it
runs, via ``urllib.request.urlretrieve`` -- which has neither retry nor resume.
Against a throttling CDN that aborts the stream mid-transfer it dies with
``ContentTooShortError`` and the worker can't segment at all. Baked into the
image, that failure would otherwise hit at runtime on every fresh container.

``install_weights`` looks for ``<exports>/<url-basename>.zip`` and only downloads
when that file is absent (``zip_name = zip_url.split('/')[-1]``). So we fetch the
archives here with curl -- which *does* retry and resume on a dropped/throttled
connection -- into that exports folder. ``totalspineseg_init`` then finds them and
only extracts (no network), so the run is reliable and offline thereafter.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from totalspineseg.utils.utils import ZIP_URLS

data_dir = Path(os.environ["TOTALSPINESEG_DATA"])
exports = data_dir / "nnUNet" / "exports"
exports.mkdir(parents=True, exist_ok=True)

for name, url in ZIP_URLS.items():
    dest = exports / url.split("/")[-1]
    print(f"Fetching weights '{name}' -> {dest}", flush=True)
    # --retry/--retry-all-errors + -C - make curl resume a partial transfer
    # instead of restarting from zero (the exact failure mode that broke the
    # built-in urlretrieve at 92%). --fail surfaces HTTP errors as a non-zero
    # exit so the build fails loudly rather than producing a broken image.
    subprocess.run(
        [
            "curl", "-L", "--fail", "--retry", "10", "--retry-delay", "5",
            "--retry-all-errors", "-C", "-", "-o", str(dest), url,
        ],
        check=True,
    )

print("All TotalSpineSeg weight archives fetched.", flush=True)
sys.exit(0)
