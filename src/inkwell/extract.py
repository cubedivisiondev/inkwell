"""Lift ink off paper and into an alpha channel.

The whole library rests on one decision: the grayscale ramp of the photograph IS
the alpha channel. It is never thresholded.

Thresholding is the obvious move and it is the reason most extracted signatures
look wrong. A hard cut discards the anti-aliased stroke edge, the pressure
variation, and the dry-marker skip. What survives is a flat silhouette, and the
eye reads a flat silhouette as clip art rather than ink. Keeping the ramp keeps
every one of those cues.

Two corrections have to land before the ramp is usable.

Paper is not white. A phone meters for the dark ink, so a sheet of printer paper
comes back around luma 185 rather than 255. Inverting that directly leaves the
background sitting at roughly 27 percent opacity, a gray veil over the entire
image.

Lighting is not even. There is a gradient across the sheet and texture within it.
No single black point and white point can correct a gradient. Raising the floor
far enough to clear the dark corner eats the thin strokes in the bright one.

Flat-field correction solves both at once. Dilating the image past the stroke
width erases the ink entirely and leaves a map of how the paper was lit. Blurring
that map and dividing the original by it normalizes illumination per pixel, so
the paper lands at a uniform white no matter how it was shot.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter

from .despeckle import despeckle

__all__ = ["Extraction", "extract"]

# The background model only needs to be smooth, so it is built at reduced scale.
_DOWNSCALE = 6
# Dilation radius at reduced scale. Scaled up this must exceed the stroke width,
# or the strokes survive into the background model and get divided out of the ink.
_DILATE = 9
_SMOOTH = 15
# Alpha at or below this is paper grain rather than ink.
_TOE = 10


@dataclass(frozen=True)
class Extraction:
    """An extracted mark: an alpha matte plus the numbers behind it."""

    alpha: np.ndarray
    source_size: tuple[int, int]
    components: int
    cliff: float

    @property
    def size(self) -> tuple[int, int]:
        h, w = self.alpha.shape
        return w, h

    @property
    def coverage(self) -> float:
        """Fraction of the canvas carrying ink. A sanity check on the matte."""
        return float((self.alpha > 8).mean())

    def colorize(self, rgb: tuple[int, int, int]) -> Image.Image:
        """Paint a solid color through the matte.

        The color comes from here rather than from the photograph, so none of the
        paper's color cast survives into the output. That is what allows one
        photo of black marker to produce a clean white or gold mark.
        """
        h, w = self.alpha.shape
        out = np.zeros((h, w, 4), dtype=np.uint8)
        out[..., 0], out[..., 1], out[..., 2] = rgb
        out[..., 3] = self.alpha
        return Image.fromarray(out, "RGBA")

    def bitmap(self, threshold: int = 110) -> Image.Image:
        """A hard bilevel bitmap, for vector tracing only.

        This is the one place a threshold is correct. A vector curve has no
        anti-aliasing to preserve, because the curve itself is the edge.
        """
        return Image.fromarray((self.alpha > threshold).astype(np.uint8) * 255).convert("1")


def _background(gray: Image.Image) -> np.ndarray:
    """Model how the paper was lit, with the ink removed.

    Grayscale dilation replaces each pixel with the brightest in its neighborhood.
    Given dark ink on light paper and a radius wider than the strokes, the ink is
    overwritten by surrounding paper and what remains is the illumination field.
    """
    w, h = gray.size
    small = gray.resize((max(w // _DOWNSCALE, 1), max(h // _DOWNSCALE, 1)), Image.LANCZOS)
    small = small.filter(ImageFilter.MaxFilter(_DILATE * 2 + 1))
    small = small.filter(ImageFilter.GaussianBlur(_SMOOTH))
    return np.asarray(small.resize((w, h), Image.BICUBIC), dtype=np.float32)


def extract(
    image: Image.Image | str,
    *,
    margin: float = 0.03,
    clean: bool = True,
    invert: bool = False,
) -> Extraction:
    """Extract a mark from a photograph of ink on paper.

    Args:
        image: A PIL image or a path. Any orientation, any resolution.
        margin: Padding around the trimmed mark, as a fraction of its width.
        clean: Drop paper grain and edge artifacts. See :mod:`inkwell.despeckle`.
        invert: Set for light ink on dark paper, such as a paint pen on black card.

    Returns:
        An :class:`Extraction` holding the alpha matte.

    Raises:
        ValueError: If no ink is found, usually a polarity mistake. Try invert.
    """
    src = Image.open(image) if isinstance(image, str) else image
    gray = src.convert("L")

    if invert:
        gray = Image.fromarray(255 - np.asarray(gray, dtype=np.uint8))

    a = np.asarray(gray, dtype=np.float32)
    flat = np.clip(a / np.maximum(_background(gray), 1.0) * 255.0, 0, 255)
    ink = 255.0 - flat

    # Auto-level against the photograph's own distribution rather than fixed
    # constants, so exposure and marker darkness do not need to be configured.
    # The low point sits above the paper noise floor; the high point saturates
    # the darkest stroke cores to fully opaque.
    lo = max(float(np.percentile(ink, 60.0)), 12.0)
    hi = float(np.percentile(ink, 99.9))
    alpha = np.clip((ink - lo) / max(hi - lo, 1.0) * 255.0, 0, 255)
    alpha = np.clip((alpha - _TOE) * (255.0 / (255.0 - _TOE)), 0, 255)

    components, cliff = 0, 0.0
    if clean:
        alpha, components, cliff = despeckle(alpha)

    ys, xs = np.where(alpha > 12)
    if len(ys) == 0:
        raise ValueError(
            "No ink found. Expected dark marks on light paper. "
            "For light ink on dark paper, pass invert=True."
        )

    alpha = alpha[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    pad = int(alpha.shape[1] * margin)
    if pad:
        alpha = np.pad(alpha, ((pad, pad), (pad, pad)), mode="constant")

    return Extraction(
        alpha=alpha.astype(np.uint8),
        source_size=src.size,
        components=components,
        cliff=cliff,
    )
