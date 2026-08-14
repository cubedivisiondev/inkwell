"""Trace a mark to vector, for foil and for scale.

Two reasons a raster matte is not always enough.

Foil, letterpress, embossing and spot varnish are applied through a physical
plate or die. The vendor needs a closed outline to cut that plate from, not a
grid of pixels. A gold foil signature is a vector job or it is not a job.

Scale is the other. A raster mark is fixed at the resolution it was extracted at.
A traced one is resolution independent, so the same file serves a card and a
banner.

Tracing is delegated to potrace, which is the standard tool for this and is
already installed on most systems that do print work. It is an optional
dependency: everything else in the library works without it.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from .extract import Extraction

__all__ = ["available", "trace"]


def available() -> bool:
    """Whether potrace is on PATH."""
    return shutil.which("potrace") is not None


def trace(
    extraction: Extraction,
    out_path: str | Path,
    *,
    threshold: int = 110,
    turdsize: int = 2,
    alphamax: float = 1.0,
    opttolerance: float = 0.2,
) -> Path:
    """Trace an extraction to SVG.

    Args:
        extraction: The result of :func:`inkwell.extract.extract`.
        out_path: Where to write the SVG.
        threshold: Alpha above which a pixel counts as ink. Vector has no
            anti-aliasing, so this cut is unavoidable here and only here.
        turdsize: Speckles smaller than this are dropped by potrace. Kept low
            because despeckle has already run; this only catches trace-level dust.
        alphamax: Corner threshold. Higher is smoother and rounder.
        opttolerance: Curve optimisation tolerance. Higher gives fewer, looser
            segments.

    Returns:
        The path written.

    Raises:
        RuntimeError: If potrace is not installed.
    """
    if not available():
        raise RuntimeError(
            "potrace not found. Install it with 'brew install potrace' or "
            "'apt-get install potrace', or skip tracing."
        )

    out_path = Path(out_path)
    with tempfile.TemporaryDirectory() as tmp:
        pbm = Path(tmp) / "trace.pbm"
        extraction.bitmap(threshold).save(pbm)
        subprocess.run(
            [
                "potrace", "-s", "-o", str(out_path),
                "--turdsize", str(turdsize),
                "--alphamax", str(alphamax),
                "--opttolerance", str(opttolerance),
                str(pbm),
            ],
            check=True,
            capture_output=True,
        )
    return out_path
