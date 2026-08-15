"""A synthetic photograph of ink, reproducing the conditions that make this hard.

Real test images cannot be committed here, so the fixture manufactures the same
four properties a phone camera produces:

    gray paper          luma around 185 rather than 255, because the sensor
                        meters for the dark ink
    a lighting gradient one side of the sheet brighter than the other
    grain and specks    sensor noise, dust, and a scuff along a sheet edge
    soft stroke edges   ink does not have a hard boundary, and neither does the
                        lens rendering it

That last one takes real effort to fake. PIL's drawing primitives are not
anti-aliased, so strokes drawn directly land with binary edges and the fixture
would not exercise the one property the library exists to preserve. The marks are
therefore drawn on a supersampled canvas and reduced, which produces a genuine
alpha ramp along every edge.

An extractor that only works on a clean scan will pass nothing here.
"""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image, ImageDraw

PAPER = 185
INK = 45
SS = 3  # supersample factor, for anti-aliased stroke edges


def _ink_mask(size: tuple[int, int], strokes) -> np.ndarray:
    """Draw at SS times scale and reduce, giving soft edges. Returns 0.0 to 1.0."""
    w, h = size
    big = Image.new("L", (w * SS, h * SS), 0)
    draw = ImageDraw.Draw(big)
    for kind, coords, width in strokes:
        scaled = [c * SS for c in coords]
        if kind == "line":
            draw.line(scaled, fill=255, width=width * SS)
        elif kind == "ring":
            draw.ellipse(scaled, outline=255, width=width * SS)
        elif kind == "dot":
            draw.ellipse(scaled, fill=255)
        elif kind == "box":
            draw.rectangle(scaled, fill=255)
    return np.asarray(big.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.0


def _page(size: tuple[int, int], mask: np.ndarray, *, gradient=True, grain=True,
          ink: int = INK, seed: int = 20260814) -> Image.Image:
    """Composite an ink mask onto lit, grainy paper."""
    w, h = size
    rng = np.random.default_rng(seed)
    paper = np.full((h, w), float(PAPER), dtype=np.float32)
    if gradient:
        paper += np.linspace(-22, 18, w, dtype=np.float32)[None, :]
    if grain:
        paper += rng.normal(0.0, 3.0, (h, w)).astype(np.float32)
    blended = paper * (1.0 - mask) + float(ink) * mask
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), "L")


@pytest.fixture
def inked() -> Image.Image:
    """Four real marks, one edge scuff, and sixty specks of dust.

    The scuff is sized deliberately at roughly 140px of area against the dot's
    ~900. Cliff detection separates by scale, so an artifact must be smaller
    than the smallest real mark for any size-based rule to split them. That
    holds comfortably in practice: in the photographs this library was built
    from, the edge streak measured 297 against a smallest real glyph of 13771.
    The `blot` fixture covers what happens when it does not hold.
    """
    size = (1200, 400)
    marks = [
        ("line", (120, 250, 260, 120), 17),   # these two join into one V
        ("line", (260, 120, 400, 250), 17),
        ("ring", (520, 130, 700, 280), 16),
        ("line", (820, 120, 820, 280), 17),
        ("dot", (870, 140, 904, 174), 0),     # small but real, must survive
    ]
    page = _page(size, _ink_mask(size, marks))

    draw = ImageDraw.Draw(page)
    draw.line([18, 60, 18, 130], fill=INK + 40, width=2)          # edge scuff
    rng = np.random.default_rng(77)
    for x, y in rng.integers([0, 0], list(size), size=(60, 2)):   # dust
        draw.ellipse([x, y, x + 2, y + 2], fill=INK + 60)
    return page


@pytest.fixture
def blot() -> Image.Image:
    """A page whose artifact is LARGER than its smallest real mark.

    The pathological case for scale-based separation, kept so the limitation is
    demonstrated rather than merely asserted in a comment.
    """
    size = (800, 300)
    marks = [
        ("line", (100, 80, 300, 220), 16),    # a real stroke
        ("dot", (360, 140, 384, 164), 0),     # a real dot, ~450px
    ]
    page = _page(size, _ink_mask(size, marks), gradient=False, grain=False)
    ImageDraw.Draw(page).rectangle([600, 40, 640, 260], fill=INK + 30)  # thumb smudge
    return page
