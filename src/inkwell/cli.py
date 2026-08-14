"""Command line interface.

Three verbs: extract a mark, list the print presets, write a guide template.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__
from .cards import PRESETS, geometry, guides
from .extract import extract
from .trace import available as trace_available
from .trace import trace

# Named so a colour can be asked for by word rather than by hex.
INKS: dict[str, tuple[int, int, int]] = {
    "black": (0, 0, 0),
    "white": (255, 255, 255),
    "gold": (201, 162, 74),
    "silver": (192, 192, 192),
    "red": (200, 32, 38),
    "blue": (28, 62, 138),
}


def _ink(name: str) -> tuple[int, int, int]:
    """Resolve an ink name or a #rrggbb hex string."""
    key = name.strip().lower()
    if key in INKS:
        return INKS[key]
    h = key.lstrip("#")
    if len(h) == 6:
        try:
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
        except ValueError:
            pass
    raise argparse.ArgumentTypeError(
        f"Unknown ink {name!r}. Use a name ({', '.join(INKS)}) or #rrggbb."
    )


def _cmd_extract(args: argparse.Namespace) -> int:
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = args.name or Path(args.image).stem

    result = extract(
        args.image,
        margin=args.margin,
        clean=not args.no_clean,
        invert=args.invert,
    )

    w, h = result.size
    sw, sh = result.source_size
    print(f"  {stem}: {sw}x{sh} -> {w}x{h}")
    if result.cliff:
        print(f"    despeckle: {result.components} marks kept, cliff {result.cliff:.0f}x")
    print(f"    ink coverage: {result.coverage * 100:.1f}%")

    for name in args.inks:
        path = out_dir / f"{stem}-{name}.png"
        result.colorize(_ink(name)).save(path)
        print(f"    wrote {path}")

    if args.trace:
        if not trace_available():
            print("    potrace not installed, skipping vector", file=sys.stderr)
        else:
            path = trace(result, out_dir / f"{stem}.svg", threshold=args.threshold)
            print(f"    wrote {path}")

    return 0


def _cmd_presets(_: argparse.Namespace) -> int:
    print(f"  {'preset':<16}{'trim':<18}{'canvas @300':<14}{'canvas @600'}")
    for key, spec in sorted(PRESETS.items()):
        g300, g600 = spec.at(300), spec.at(600)
        trim = f'{spec.width_in}in x {spec.height_in}in'
        print(
            f"  {key:<16}{trim:<18}"
            f"{'x'.join(map(str, g300['canvas'])):<14}"
            f"{'x'.join(map(str, g600['canvas']))}"
        )
    return 0


def _cmd_template(args: argparse.Namespace) -> int:
    g = geometry(args.preset, args.dpi)
    out = Path(args.out or f"{args.preset}-guides-{args.dpi}dpi.png")
    guides(args.preset, args.dpi).save(out)

    print(f"  {args.preset} @ {args.dpi}dpi")
    for key in ("canvas", "trim", "safe"):
        print(f"    {key:<8}{g[key][0]} x {g[key][1]}")
    print(f"    trim inset {g['trim_inset'][0]}px | safe inset {g['safe_inset'][0]}px")
    print(f"    wrote {out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="inkwell",
        description="Lift ink off paper and into a transparent, print-ready asset.",
    )
    p.add_argument("--version", action="version", version=f"inkwell {__version__}")
    sub = p.add_subparsers(dest="command", required=True)

    e = sub.add_parser("extract", help="extract a mark from a photo of ink")
    e.add_argument("image", help="photo of ink on paper")
    e.add_argument("-o", "--out", default=".", help="output directory")
    e.add_argument("-n", "--name", help="basename for outputs (default: the photo's)")
    e.add_argument(
        "-i", "--inks", nargs="+", default=["black"],
        metavar="INK", help=f"one or more of {', '.join(INKS)}, or #rrggbb",
    )
    e.add_argument("-t", "--trace", action="store_true", help="also write an SVG")
    e.add_argument("--threshold", type=int, default=110, help="vector trace cut (default 110)")
    e.add_argument("--margin", type=float, default=0.03, help="padding, fraction of width")
    e.add_argument("--invert", action="store_true", help="light ink on dark paper")
    e.add_argument("--no-clean", action="store_true", help="keep grain and artifacts")
    e.set_defaults(func=_cmd_extract)

    s = sub.add_parser("presets", help="list known print geometries")
    s.set_defaults(func=_cmd_presets)

    t = sub.add_parser("template", help="write a trim and safe guide overlay")
    t.add_argument("preset", choices=sorted(PRESETS), help="which card")
    t.add_argument("--dpi", type=int, default=600, help="resolution (default 600)")
    t.add_argument("-o", "--out", help="output path")
    t.set_defaults(func=_cmd_template)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except (ValueError, KeyError, RuntimeError, OSError) as exc:
        print(f"  error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
