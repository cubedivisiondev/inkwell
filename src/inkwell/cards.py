"""Print geometry, and the guide template that goes with it.

An extracted mark usually ends up on something that gets printed, and print jobs
are rejected for arithmetic rather than for art. This module carries the geometry
so it does not have to be rederived, and draws the guides so the numbers are
visible while designing.

Three rectangles matter, and they are concentric:

    canvas   what you upload, artwork must reach every edge of it
    trim     where the blade falls, plus or minus its tolerance
    safe     everything that must survive goes inside this

The gap between canvas and trim is the bleed, and the reason it exists is that
blades wander. Artwork that stops exactly at the trim line shows a white sliver
when the cut drifts outward by half a millimetre.

One detail is worth stating because it is expensive to discover. MakePlayingCards
documents an eighth-inch bleed, which is 37.5 pixels at 300dpi, and then rounds
it DOWN to 36. Building to 26 instead, an easy transposition, yields a 652 by
1102 canvas where 672 by 1122 was required. That fails twice over: stretched to
fill, the artwork lands at 291 effective dpi and trips the resolution warning,
and the aspect ratio no longer matches so the overflow crops unevenly along the
edges. One wrong number, two symptoms that look unrelated.

Bleed is therefore stored in pixels at 300dpi rather than in inches, so a
vendor's rounding is reproduced exactly instead of recalculated.
"""

from __future__ import annotations

from dataclasses import dataclass

from PIL import Image, ImageDraw

__all__ = ["CardSpec", "PRESETS", "geometry", "guides"]

TRIM_COLOR = (255, 0, 128, 200)
SAFE_COLOR = (0, 200, 255, 200)


@dataclass(frozen=True)
class CardSpec:
    """A printable card: trim size in inches, bleed in pixels at 300dpi."""

    name: str
    width_in: float
    height_in: float
    bleed_px300: int = 36
    note: str = ""

    def at(self, dpi: int = 300) -> dict[str, tuple[int, int]]:
        """Resolve every rectangle at a given resolution.

        Returns:
            canvas, trim and safe as (width, height) pixel pairs, plus the two
            inset distances that place trim and safe inside the canvas.
        """
        scale = dpi / 300
        bleed = round(self.bleed_px300 * scale)
        trim_w, trim_h = round(self.width_in * dpi), round(self.height_in * dpi)
        return {
            "canvas": (trim_w + 2 * bleed, trim_h + 2 * bleed),
            "trim": (trim_w, trim_h),
            "safe": (trim_w - 2 * bleed, trim_h - 2 * bleed),
            "trim_inset": (bleed, bleed),
            "safe_inset": (2 * bleed, 2 * bleed),
        }


PRESETS: dict[str, CardSpec] = {
    "mpc-business": CardSpec("MPC Business Deck", 2.0, 3.5, 36, "50mm x 89mm"),
    "mpc-tarot": CardSpec("MPC Tarot", 2.75, 4.75, 36),
    "mpc-poker": CardSpec("MPC Poker", 2.5, 3.5, 36, "63mm x 88mm"),
    "mpc-bridge": CardSpec("MPC Bridge", 2.25, 3.5, 36),
    "mpc-mini": CardSpec("MPC Mini", 1.75, 2.5, 36),
    "mpc-big": CardSpec("MPC Big", 3.5, 5.75, 36),
    "business-card": CardSpec("Business card, landscape", 3.5, 2.0, 38, "generic 1/8in bleed"),
}


def geometry(preset: str, dpi: int = 300) -> dict[str, tuple[int, int]]:
    """Resolve a named preset at a given resolution."""
    if preset not in PRESETS:
        raise KeyError(f"Unknown preset {preset!r}. Available: {', '.join(sorted(PRESETS))}")
    return PRESETS[preset].at(dpi)


def _dashed(draw: ImageDraw.ImageDraw, box, color, width: int, dash: int) -> None:
    """Dashed rectangle, so the safe line reads differently from the trim line."""
    x0, y0, x1, y1 = box
    for x in range(x0, x1, dash * 2):
        draw.line([x, y0, min(x + dash, x1), y0], fill=color, width=width)
        draw.line([x, y1, min(x + dash, x1), y1], fill=color, width=width)
    for y in range(y0, y1, dash * 2):
        draw.line([x0, y, x0, min(y + dash, y1)], fill=color, width=width)
        draw.line([x1, y, x1, min(y + dash, y1)], fill=color, width=width)


def guides(preset: str, dpi: int = 300) -> Image.Image:
    """Draw a transparent guide overlay for a preset.

    Layer this above the artwork while designing and hide it before exporting.
    Solid magenta is the trim, dashed cyan is the safe area.
    """
    g = geometry(preset, dpi)
    w, h = g["canvas"]
    trim_x, trim_y = g["trim_inset"]
    safe_x, safe_y = g["safe_inset"]

    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    line = max(2, round(3 * dpi / 600))

    draw.rectangle([trim_x, trim_y, w - trim_x, h - trim_y], outline=TRIM_COLOR, width=line)
    _dashed(draw, (safe_x, safe_y, w - safe_x, h - safe_y), SAFE_COLOR, line, max(12, w // 48))
    return overlay
