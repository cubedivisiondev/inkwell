"""INKWELL - lift ink off paper and into a transparent, print-ready asset.

Photograph something you wrote. Get back a mark with a real alpha channel, in any
color, plus a vector trace for foil.

    from inkwell import extract

    mark = extract("signature.jpg")
    mark.colorize((255, 255, 255)).save("signature-white.png")

The design note that matters: the grayscale ramp of the photograph IS the alpha
channel, never a threshold. See inkwell.extract for why that is the whole trick.
"""

from .cards import PRESETS, CardSpec, geometry, guides
from .despeckle import despeckle
from .extract import Extraction, extract
from .trace import trace

__version__ = "0.3.0"
__all__ = [
    "extract",
    "Extraction",
    "despeckle",
    "trace",
    "guides",
    "geometry",
    "CardSpec",
    "PRESETS",
    "__version__",
]
