#!/usr/bin/env python3
"""Render the README demo strip from the test fixture.

Uses the synthetic page rather than a real signature, so the repository never
carries anyone's actual handwriting. Run from the repository root:

    python docs/make_demo.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tests"))

from conftest import _ink_mask, _page  # noqa: E402

from inkwell import extract  # noqa: E402

PANEL_W = 900
PAD = 24
CHECKER = 16


def checkerboard(size: tuple[int, int]) -> Image.Image:
    """Standard transparency backdrop, so the alpha channel is legible."""
    w, h = size
    tile = Image.new("RGB", (CHECKER * 2, CHECKER * 2), (218, 218, 218))
    for box in ((0, 0), (CHECKER, CHECKER)):
        tile.paste(Image.new("RGB", (CHECKER, CHECKER), (246, 246, 246)), box)
    out = Image.new("RGB", size)
    for y in range(0, h, CHECKER * 2):
        for x in range(0, w, CHECKER * 2):
            out.paste(tile, (x, y))
    return out


def fit(im: Image.Image) -> Image.Image:
    return im.resize((PANEL_W, round(im.height * PANEL_W / im.width)), Image.LANCZOS)


def main() -> None:
    size = (1200, 400)
    marks = [
        ("line", (120, 250, 260, 120), 17),
        ("line", (260, 120, 400, 250), 17),
        ("ring", (520, 130, 700, 280), 16),
        ("line", (820, 120, 820, 280), 17),
        ("dot", (870, 140, 904, 174), 0),
    ]
    photo = _page(size, _ink_mask(size, marks))
    mark = extract(photo)

    top = fit(photo.convert("RGB"))
    on_checker = fit(mark.colorize((17, 17, 17)))
    mid = checkerboard(on_checker.size)
    mid.paste(on_checker, (0, 0), on_checker)
    bottom = fit(mark.colorize((255, 255, 255)))
    dark = Image.new("RGB", bottom.size, (12, 12, 12))
    dark.paste(bottom, (0, 0), bottom)

    panels = [top, mid, dark]
    total_h = sum(p.height for p in panels) + PAD * (len(panels) + 1)
    strip = Image.new("RGB", (PANEL_W + PAD * 2, total_h), (255, 255, 255))
    y = PAD
    for panel in panels:
        strip.paste(panel, (PAD, y))
        y += panel.height + PAD

    out = ROOT / "docs" / "demo.png"
    strip.save(out)
    print(f"  wrote {out}  ({strip.width}x{strip.height})")


if __name__ == "__main__":
    main()
