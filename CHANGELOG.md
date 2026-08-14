# CHANGELOG

Versioned under [Semantic Versioning 2.0.0](https://semver.org). Per PUDDY
versioning canon, `1.0.0` is a founder lock and is not taken by default.

## 0.2.0 - 2026-08-14

### Added

- **A browser front end** at `web/`. Three files, no build step, no dependencies,
  no network calls. Drop or paste a photograph, pick an ink, download a PNG.
- The engine ported to JavaScript, running in a Web Worker so a four megapixel
  photograph extracts without freezing the page. Same flat-field correction, same
  alpha ramp, same cliff-detected despeckle, and the same result within a pixel
  of the same crop.
- `SECURITY.md`, stating what the software does with an image and why a signature
  is treated as a credential.

### Changed

- Public documentation rewritten in the founder's formal voice, per the GitHub
  Protocol's public-surface standard.

### Performance

Browser extraction of a 4.6 megapixel photograph fell from 5.7 seconds to roughly
2, by removing work rather than adding cleverness:

- Routing greyscale through a full-resolution canvas purely to shrink it cost
  1.2 seconds. The browser downscales the source directly in 30 milliseconds.
- Scaling the illumination field back to full resolution cost a further 3.3
  seconds, most of it reading eighteen megabytes back off the GPU, to reconstruct
  a field that is smooth by construction. It is now interpolated in place from
  the reduced field.
- The dilation became a monotonic-deque sliding maximum, making it linear in
  pixels rather than proportional to the radius.

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
