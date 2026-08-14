<div align="center">

# INKWELL

**Photograph something you wrote. Get back a transparent, print-ready mark that still looks like ink.**

[![License: MIT](https://img.shields.io/badge/License-MIT-111111.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.9%2B-111111.svg)](pyproject.toml)
[![Tests](https://github.com/cubedivisiondev/inkwell/actions/workflows/test.yml/badge.svg)](.github/workflows/test.yml)
[![Local](https://img.shields.io/badge/uploads-none-111111.svg)](#privacy)
[![Vector](https://img.shields.io/badge/vector-potrace-111111.svg)](#vector-output)

[Report a bug](https://github.com/cubedivisiondev/inkwell/issues/new) · [Request a feature](https://github.com/cubedivisiondev/inkwell/issues/new)

**◆ Built by [PUDDY](https://puddystudios.com) to put a sharpie signature on a printed card.**

<img src="docs/demo.png" alt="A photo of ink on grey paper, the same mark extracted onto transparency, and the mark recoloured white on black" width="640" />

<sub>Lit, grainy paper in. Transparent alpha out. Any colour, same matte.</sub>

</div>

---

## What it is

Sign your name. Take a photo of it. INKWELL gives you back a PNG with a real alpha channel, in whatever colour you want, plus a vector trace for foil work.

The output still reads as ink. That is the entire point, and it is harder than it sounds.

Everything runs on your machine. There is no service, no account, and nothing is uploaded.

## Quick start

```bash
pip install inkwell-ink
inkwell extract signature.jpg --inks white gold --trace
```

That writes `signature-white.png`, `signature-gold.png`, and `signature.svg`.

```python
from inkwell import extract

mark = extract("signature.jpg")
mark.colorize((255, 255, 255)).save("signature-white.png")
```

## Why not just threshold it

Because thresholding is what makes extracted signatures look fake, and almost every tool does it.

A hard cut throws away the anti-aliased stroke edge, the pressure variation, and the dry-marker skip. What is left is a flat silhouette, and the eye reads a flat silhouette as clip art. You can tell instantly, even if you cannot say why.

INKWELL never thresholds. **The greyscale ramp of the photograph IS the alpha channel.** Every soft edge survives, so the mark still behaves like ink when you put it on something.

## The three problems it solves

**✵ Paper is not white.** A phone meters for the dark ink, so printer paper comes back around luma 185, not 255. Inverting that directly leaves the background at roughly 27 percent opacity: a grey veil over your whole design.

**✵ Lighting is not even.** There is a gradient across the sheet and texture within it. No single black point and white point fixes a gradient. Raise the floor enough to clear the dark corner and you eat the thin strokes in the bright one.

Both are solved by flat-field correction. Dilating past the stroke width erases the ink and leaves a map of how the paper was lit. Blur that, divide the original by it, and the paper lands at a uniform white no matter how it was shot.

**✵ Photos pick up more than the mark.** Grain, dust, the shadow along a sheet edge. All of it survives flat-fielding, because all of it is a real change in luminance.

Two obvious filters fail here, and the failures are why this module exists:

- **A fixed size threshold** cannot be shared between images. The dot over an i and the shadow along a sheet edge are comparably sized. One image's signal is the next one's noise.
- **A position filter** ("keep small marks inside the glyph span") fails worse. Grain is scattered across the whole frame, so the span contains hundreds of specks. On a real photo this kept 588 of them.

What actually separates ink from grain is scale. Ink is orders of magnitude bigger, and the size distribution has a cliff rather than a slope:

```
signature      208856, 89173, 88238, 5890, 1805 || 88, 76, 76 ...     21x
phone number   30289 .................... 13771 || 297, 189 ...       46x
```

The gap is enormous, and it sits in a different place in every image. So INKWELL **finds the cliff instead of hardcoding it**: sort the components, take the largest consecutive ratio, cut there. Self-calibrating, no tuning, and it keeps your punctuation.

## Print geometry

Print jobs get rejected for arithmetic, not for art. INKWELL carries the numbers so you do not rederive them.

```bash
inkwell presets
inkwell template mpc-business --dpi 600
```

| preset | trim | canvas @300 | canvas @600 |
| --- | --- | --- | --- |
| `mpc-business` | 2 x 3.5 in | 672 x 1122 | 1344 x 2244 |
| `mpc-tarot` | 2.75 x 4.75 in | 897 x 1497 | 1794 x 2994 |
| `mpc-poker` | 2.5 x 3.5 in | 822 x 1122 | 1644 x 2244 |
| `mpc-bridge` | 2.25 x 3.5 in | 747 x 1122 | 1494 x 2244 |
| `mpc-mini` | 1.75 x 2.5 in | 597 x 822 | 1194 x 1644 |
| `mpc-big` | 3.5 x 5.75 in | 1122 x 1797 | 2244 x 3594 |
| `business-card` | 3.5 x 2 in | 1126 x 676 | 2252 x 1352 |

`template` writes a transparent overlay: solid magenta for the trim, dashed cyan for the safe area. Layer it above your artwork while designing and hide it before exporting.

**One number worth stating.** MakePlayingCards documents a 1/8 inch bleed, which is 37.5 pixels at 300dpi, then rounds it **down to 36**. Build to 26 instead, an easy transposition, and you get a 652 x 1102 canvas where 672 x 1122 was required. That fails twice: stretched to fill it lands at 291 effective dpi and trips the resolution warning, and the aspect no longer matches so the overflow crops unevenly. One wrong number, two symptoms that look unrelated.

INKWELL stores bleed in pixels at 300dpi rather than inches, so a vendor's rounding is **reproduced exactly** instead of recalculated.

**Work at 2x.** At the published minimum you sit exactly on the 300dpi floor, so any transform in a vendor's web editor resamples you under it and the warning comes back. Double the resolution and no reposition can trip it.

## Vector output

`--trace` runs [potrace](https://potrace.sourceforge.net/) and writes an SVG.

You need this for foil, letterpress, embossing, and spot varnish. Those are applied through a physical plate, and the vendor needs a closed outline to cut it from, not a grid of pixels. A gold foil signature is a vector job or it is not a job.

This is also the one place a threshold is correct. A vector curve has no anti-aliasing to preserve, because the curve is the edge.

potrace is optional. Everything else works without it.

```bash
brew install potrace          # macOS
sudo apt-get install potrace  # Debian, Ubuntu
```

## CLI

```
inkwell extract PHOTO [-o DIR] [-n NAME] [-i INK ...] [-t] [--invert] [--no-clean]
inkwell presets
inkwell template PRESET [--dpi N] [-o PATH]
```

| flag | what it does |
| --- | --- |
| `-i, --inks` | `black` `white` `gold` `silver` `red` `blue`, or any `#rrggbb`. Repeatable. |
| `-t, --trace` | Also write an SVG. |
| `--invert` | Light ink on dark paper, such as a paint pen on black card. |
| `--no-clean` | Keep grain and artifacts. Useful for diagnosing a bad extraction. |
| `--margin` | Padding around the mark, as a fraction of its width. Default `0.03`. |
| `--threshold` | Vector trace cut. Default `110`. Raster output ignores this. |

The colour is applied from the flag, not sampled from the photo, so no paper cast survives. One photo of black marker gives you a clean white mark.

## Shooting the photo

INKWELL is built to tolerate a bad photo, but it cannot invent detail:

- **Flat, even light beats bright light.** Overcast window light is ideal. Direct sun casts a hard gradient.
- **Shoot square to the page.** Perspective is not corrected.
- **Fill the frame.** More pixels on the stroke means a better ramp.
- **Do not use flash.** It blows the highlight and flattens the ramp you need.
- **Any paper is fine.** Grain, texture and tint are all handled.

## Privacy

Everything is local. No network calls, no telemetry, no account. Your signature is a credential. It should never leave your machine, and with INKWELL it does not.

## Install

```bash
pip install inkwell-ink            # library and CLI
brew install potrace               # optional, for --trace
```

From source:

```bash
git clone https://github.com/cubedivisiondev/inkwell
cd inkwell
pip install -e ".[dev]"
pytest -q
```

Requires Python 3.9+, numpy, Pillow and scipy.

## Versioning

[Semantic Versioning 2.0.0](https://semver.org). Under PUDDY canon `1.0.0` is a deliberate lock rather than a default, so this ships at `0.1.0` until the API has earned the number. See [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).

---

<div align="center">

**◆ A [PUDDY](https://puddystudios.com) project.**

</div>
