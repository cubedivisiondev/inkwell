"""Separate ink from paper grain by finding the cliff between them.

Photographing paper picks up more than the mark. Grain, dust, a shadow along a
sheet edge, the shadow of the pen itself. All of it survives flat-field
correction, because all of it is a genuine change in luminance.

Two obvious filters both fail, and the failures are instructive.

A fixed size threshold cannot be shared between images. The dot over an i and the
shadow along a sheet edge are comparably sized. One image's signal is the next
image's noise, so any constant is wrong for something.

A position filter fails differently. The intuition is that real punctuation sits
inside the span of the main glyphs while artifacts sit outside it, so small marks
within the span can be kept. In practice grain is scattered across the whole
frame, so the span contains hundreds of specks. Measured on a real photograph
this rule kept 588 of them.

What does separate the two is scale. Ink is orders of magnitude larger than
grain, and the size distribution has a cliff rather than a slope:

    signature   208856, 89173, 88238, 5890, 1805 || 88, 76, 76, ...    21x
    phone number  30289 ................. 13771 || 297, 189, ...       46x

The gap is enormous and it is in a different place in each image. So this module
finds the cliff instead of hardcoding where it should be: sort the component
sizes, take the largest consecutive ratio, cut there. Self-calibrating, with no
per-image tuning.

The limit, stated plainly: this separates by SCALE, so an artifact larger than
the smallest real mark cannot be removed by it. A thumb smudge bigger than the
dot over an i will survive, and no threshold on this axis would do better. In
practice the margin is wide (in the photographs this was built from, the edge
streak measured 297 against a smallest real glyph of 13771) but a heavy smudge
or a fold shadow crossing the frame needs to be cropped out before extraction,
or painted out after. Pass clean=False to inspect what the matte actually caught.
"""

from __future__ import annotations

import numpy as np

__all__ = ["despeckle"]

# Below this a component cannot anchor a cliff, so a ratio between two specks
# cannot win the search.
_MIN_ANCHOR = 200.0
# A cliff shallower than this is not a cliff. Some images are simply clean.
_MIN_RATIO = 5.0
_SEARCH = 80


def despeckle(alpha: np.ndarray) -> tuple[np.ndarray, int, float]:
    """Remove grain and edge artifacts, keeping every real mark.

    Args:
        alpha: The alpha matte from :func:`inkwell.extract.extract`.

    Returns:
        The cleaned matte, the number of components kept, and the cliff ratio
        that was found. A ratio of 0.0 means no cliff was detected and a
        conservative floor was applied instead.
    """
    try:
        from scipy import ndimage
    except ImportError:  # pragma: no cover - scipy is a hard dependency
        return alpha, 0, 0.0

    mask = alpha > 12
    labelled, count = ndimage.label(mask)
    if count < 2:
        return alpha, count, 0.0

    sizes = np.asarray(ndimage.sum(mask, labelled, range(1, count + 1)))
    ordered = np.sort(sizes)[::-1]

    cut, best = float(ordered[0]), 1.0
    for i in range(min(len(ordered) - 1, _SEARCH)):
        if ordered[i + 1] < 1:
            break
        ratio = ordered[i] / ordered[i + 1]
        if ratio > best and ordered[i] >= _MIN_ANCHOR:
            best, cut = ratio, float(ordered[i])

    if best < _MIN_RATIO:
        # No clear separation. Keep anything plausibly a mark rather than
        # guessing at a cut that the distribution does not support.
        cut, best = _MIN_ANCHOR, 0.0

    keep = np.concatenate(([False], sizes >= cut))
    return np.where(keep[labelled], alpha, 0), int(keep.sum()), best
