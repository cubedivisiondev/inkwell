# CHANGELOG

Versioned under [Semantic Versioning 2.0.0](https://semver.org). Per PUDDY
versioning canon, `1.0.0` is a founder lock and is not taken by default.

## 0.1.0 - 2026-08-14

First release. Extracted from the pipeline built to put a hand-inked signature
onto a printed card.

### Added

- `extract()` - flat-field correction and alpha-ramp matting, no thresholding.
- `despeckle()` - cliff detection to separate ink from grain without a fixed cut.
- `trace()` - potrace wrapper for vector output, needed for foil and die work.
- `guides()` and `geometry()` - print rectangles for seven card presets,
  including the MakePlayingCards bleed rounding that the vendor applies.
- `inkwell` CLI with `extract`, `presets` and `template`.
