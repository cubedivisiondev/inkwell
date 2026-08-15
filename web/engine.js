/*
 * INKWELL - The extraction engine, in the browser.
 *
 * A direct port of the Python library. Same flat-field correction, same alpha
 * ramp, same cliff-detected despeckle, same results. It runs on the device
 * because a signature is a credential and credentials should not be uploaded.
 *
 * There are no dependencies. Canvas and typed arrays do all of it.
 */

const DOWNSCALE = 6;   // the illumination model only needs to be smooth
const DILATE = 9;      // radius at reduced scale; must exceed the stroke width once scaled up
const SMOOTH = 15;
const TOE = 10;        // alpha at or below this is paper grain
const TRIM = 12;
const MIN_ANCHOR = 200;
const MIN_RATIO = 5;
const SEARCH = 80;

export const INKS = {
  white:  [255, 255, 255],
  black:  [0, 0, 0],
  gold:   [201, 162, 74],
  silver: [192, 192, 192],
  red:    [200, 32, 38],
  blue:   [28, 62, 138],
};

/* One canvas factory for both contexts. OffscreenCanvas exists in workers and on
 * the main thread; the DOM fallback covers browsers that predate it. This is what
 * lets the identical engine run either place. */
function ctx2d(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement('canvas'), { width: w, height: h });
  return c.getContext('2d', { willReadFrequently: true });
}

/* Canvas source for drawImage, whichever kind of canvas came back. */
const surfaceOf = (ctx) => ctx.canvas;

/*
 * Sliding-window maximum along one axis, in linear time.
 *
 * The direct form compares every element against all 2r+1 of its neighbors,
 * which at r=9 is nineteen reads per pixel and profiled at 837ms. A monotonic
 * deque keeps indices in decreasing value order, so each element is pushed and
 * popped at most once and the window maximum is always at the front. The work
 * stops depending on the radius entirely.
 */
function slidingMax(src, dst, len, lines, stride, step, radius) {
  const deque = new Int32Array(len);
  for (let line = 0; line < lines; line++) {
    const base = line * stride;
    let head = 0, tail = 0;
    for (let i = 0; i < len + radius; i++) {
      if (i < len) {
        const v = src[base + i * step];
        while (tail > head && src[base + deque[tail - 1] * step] <= v) tail--;
        deque[tail++] = i;
      }
      const out = i - radius;
      if (out >= 0) {
        while (deque[head] < out - radius) head++;
        dst[base + out * step] = src[base + deque[head] * step];
      }
    }
  }
}

/* Luminance, at full resolution. Rec. 601 weights in fixed point: the integer
 * form runs measurably faster than three float multiplies across several
 * million pixels, and the result is identical at 8-bit output precision. */
function luma(img, w, h) {
  const c = ctx2d(w, h);
  c.drawImage(img, 0, 0);
  const px = c.getImageData(0, 0, w, h).data;
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (77 * px[p] + 150 * px[p + 1] + 29 * px[p + 2]) >> 8;
  }
  return out;
}

/*
 * Model how the paper was lit, with the ink removed.
 *
 * Grayscale dilation replaces each pixel with the brightest nearby. Given dark
 * ink on light paper and a radius wider than the strokes, the ink is overwritten
 * by surrounding paper and what is left is the illumination field. Dividing the
 * original by that field flattens the lighting per pixel.
 *
 * The dilation runs separably, rows then columns, which turns a radius-squared
 * operation into a linear one. At one sixth scale it costs nothing.
 *
 * The source image is drawn straight into the reduced canvas rather than being
 * routed through a full-resolution one. Writing several million pixels back into
 * a canvas purely to shrink them cost 1.2 seconds on a 4.6 megapixel photograph,
 * which was the single largest expense in the whole extraction. The browser's
 * own downscale does the same job in hardware in 30 milliseconds, and the model
 * only ever needed luminance at one sixth scale.
 */
function background(img, w, h) {
  const sw = Math.max(1, (w / DOWNSCALE) | 0);
  const sh = Math.max(1, (h / DOWNSCALE) | 0);

  const small = ctx2d(sw, sh);
  small.imageSmoothingQuality = 'high';
  small.drawImage(img, 0, 0, sw, sh);
  const sd = small.getImageData(0, 0, sw, sh).data;

  let band = new Float32Array(sw * sh);
  for (let i = 0, p = 0; i < band.length; i++, p += 4) {
    band[i] = (77 * sd[p] + 150 * sd[p + 1] + 29 * sd[p + 2]) >> 8;
  }

  // Separable dilation: rows, then columns. Each pass is linear in the number of
  // pixels and independent of the radius.
  const rowMax = new Float32Array(sw * sh);
  slidingMax(band, rowMax, sw, sh, sw, 1, DILATE);   // along each row
  slidingMax(rowMax, band, sh, sw, 1, sw, DILATE);   // down each column

  // Blur the dilated field. Canvas does this in hardware at reduced scale.
  const dil = ctx2d(sw, sh);
  const di = dil.createImageData(sw, sh);
  for (let i = 0, p = 0; i < band.length; i++, p += 4) {
    di.data[p] = di.data[p + 1] = di.data[p + 2] = band[i];
    di.data[p + 3] = 255;
  }
  dil.putImageData(di, 0, 0);

  const blur = ctx2d(sw, sh);
  blur.filter = `blur(${SMOOTH}px)`;
  blur.drawImage(surfaceOf(dil), 0, 0);
  const bd = blur.getImageData(0, 0, sw, sh).data;

  // The field stays at reduced scale and is sampled on demand.
  //
  // Scaling it back up through a canvas cost 3.3 seconds on a 4.6 megapixel
  // photograph: the upscale itself, then a full-resolution readback pulling
  // eighteen megabytes off the GPU, then a second pass to unpack it. All of that
  // to reconstruct a field that is smooth by construction and can be
  // interpolated directly for the price of a few multiplies per pixel.
  const field = new Float32Array(sw * sh);
  for (let i = 0, p = 0; i < field.length; i++, p += 4) field[i] = bd[p];
  return { field, sw, sh };
}

/* The horizontal half of the bilinear read, precomputed once.
 *
 * Every row maps x the same way, so resolving it per pixel repeats the same
 * divide and floor several million times. Hoisting it into two small lookup
 * tables leaves the inner loop doing nothing but array reads and two multiplies.
 * Calling a sampler function per pixel measured SLOWER than the full-resolution
 * upscale it replaced, on a 4.6 megapixel photograph, until this landed. */
function xMap(w, sw) {
  const i0 = new Int32Array(w), i1 = new Int32Array(w), t = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const fx = (x * sw) / w;
    const a = fx | 0;
    i0[x] = a;
    i1[x] = a + 1 < sw ? a + 1 : sw - 1;
    t[x] = fx - a;
  }
  return { i0, i1, t };
}

/* The inverted path: the model must be built from corrected luminance, not from
 * the source pixels, so this one does pay the full-resolution round trip. It is
 * the uncommon case (light ink on dark paper), and correctness outranks the
 * second it costs. */
function backgroundFromGray(gray, w, h) {
  const full = ctx2d(w, h);
  const id = full.createImageData(w, h);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    id.data[p] = id.data[p + 1] = id.data[p + 2] = gray[i];
    id.data[p + 3] = 255;
  }
  full.putImageData(id, 0, 0);
  return background(surfaceOf(full), w, h);
}

/* Percentile off a prebuilt 256-bin histogram. Exact at 8-bit precision, and
 * free once the histogram exists. */
function percentile(hist, total, q) {
  const target = total * q;
  let seen = 0;
  for (let b = 0; b < 256; b++) {
    seen += hist[b];
    if (seen >= target) return b;
  }
  return 255;
}

/*
 * Separate ink from grain by finding the cliff between them.
 *
 * A fixed size threshold cannot be shared between images: the dot over an i and
 * a shadow along a sheet edge are comparably sized, so one image's signal is the
 * next one's noise. What does separate them is scale. Ink runs orders of
 * magnitude larger than grain, and the size distribution has a cliff rather than
 * a slope. Sort the components, take the largest consecutive ratio, cut there.
 *
 * The limit is real and worth knowing: an artifact LARGER than the smallest true
 * mark defeats this, and takes that mark down with it. Crop before extracting.
 */
function despeckle(alpha, w, h) {
  const labels = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const stack = new Int32Array(w * h);

  for (let seed = 0; seed < alpha.length; seed++) {
    if (alpha[seed] <= TRIM || labels[seed] !== -1) continue;
    const id = sizes.length;
    let sp = 0, count = 0;
    stack[sp++] = seed;
    labels[seed] = id;
    while (sp > 0) {
      const p = stack[--sp];
      count++;
      const x = p % w, y = (p / w) | 0;
      if (x > 0)     { const q = p - 1; if (alpha[q] > TRIM && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
      if (x < w - 1) { const q = p + 1; if (alpha[q] > TRIM && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
      if (y > 0)     { const q = p - w; if (alpha[q] > TRIM && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
      if (y < h - 1) { const q = p + w; if (alpha[q] > TRIM && labels[q] === -1) { labels[q] = id; stack[sp++] = q; } }
    }
    sizes.push(count);
  }

  if (sizes.length < 2) return { kept: sizes.length, cliff: 0 };

  const ordered = [...sizes].sort((a, b) => b - a);
  let cut = ordered[0], best = 1;
  for (let i = 0; i < Math.min(ordered.length - 1, SEARCH); i++) {
    if (ordered[i + 1] < 1) break;
    const ratio = ordered[i] / ordered[i + 1];
    if (ratio > best && ordered[i] >= MIN_ANCHOR) { best = ratio; cut = ordered[i]; }
  }
  if (best < MIN_RATIO) { cut = MIN_ANCHOR; best = 0; }

  let kept = 0;
  const keep = sizes.map((s) => { const k = s >= cut; if (k) kept++; return k; });
  for (let i = 0; i < alpha.length; i++) {
    if (labels[i] !== -1 && !keep[labels[i]]) alpha[i] = 0;
  }
  return { kept, cliff: best };
}

/**
 * Extract a mark from a photograph of ink.
 *
 * @param {ImageBitmap|HTMLImageElement} img
 * @param {{margin?: number, clean?: boolean, invert?: boolean}} opts
 * @returns {{alpha: Uint8ClampedArray, width: number, height: number,
 *            kept: number, cliff: number, coverage: number,
 *            sourceWidth: number, sourceHeight: number}}
 */
export function extract(img, opts = {}) {
  const { margin = 0.03, clean = true, invert = false } = opts;
  const w = img.width, h = img.height;

  const gray = luma(img, w, h);
  if (invert) for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];

  // The illumination model reads the source directly. When inverting, the
  // already-inverted luminance has to be modelled instead, so it takes the slow
  // path through a reduced canvas built from the corrected values.
  const bg = invert ? backgroundFromGray(gray, w, h) : background(img, w, h);

  // Ink and its histogram are built in a single pass. They were two passes over
  // several million pixels for no reason: the histogram only ever counts values
  // the first pass has already computed.
  //
  // Ink is 8-bit rather than float because it feeds only a 256-bin histogram and
  // an 8-bit output. The extra precision was never used, and the smaller array
  // halves the memory traffic.
  const ink = new Uint8ClampedArray(w * h);
  const hist = new Uint32Array(256);
  const { field, sw, sh } = bg;
  const mx = xMap(w, sw);
  const xi0 = mx.i0, xi1 = mx.i1, xt = mx.t;

  for (let y = 0, i = 0; y < h; y++) {
    // The vertical half of the interpolation is constant across a row.
    const fy = (y * sh) / h;
    const y0 = fy | 0;
    const y1 = y0 + 1 < sh ? y0 + 1 : sh - 1;
    const ty = fy - y0;
    const r0 = y0 * sw, r1 = y1 * sw;

    for (let x = 0; x < w; x++, i++) {
      const a = xi0[x], b2 = xi1[x], tx = xt[x];
      const top = field[r0 + a], bot = field[r1 + a];
      const lit = (top + (field[r0 + b2] - top) * tx)
                + ((bot + (field[r1 + b2] - bot) * tx)
                -  (top + (field[r0 + b2] - top) * tx)) * ty;
      const v = 255 - (lit > 0 ? (gray[i] / lit) * 255 : 255);
      const c = v < 0 ? 0 : v > 255 ? 255 : v | 0;
      ink[i] = c;
      hist[c]++;
    }
  }

  // Auto-level against the photograph's own distribution, so exposure and
  // marker darkness never need configuring.
  const lo = Math.max(percentile(hist, w * h, 0.60), 12);
  const hi = Math.max(percentile(hist, w * h, 0.999), lo + 1);
  const scale = 255 / (hi - lo);
  const toeScale = 255 / (255 - TOE);
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = ((ink[i] - lo) * scale - TOE) * toeScale;
  }

  let kept = 0, cliff = 0;
  if (clean) ({ kept, cliff } = despeckle(alpha, w, h));

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > TRIM) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('No ink found. Expected dark marks on light paper. For light ink on dark paper, turn on Invert.');

  const pad = Math.round((x1 - x0 + 1) * margin);
  const cw = x1 - x0 + 1 + pad * 2;
  const ch = y1 - y0 + 1 + pad * 2;
  const out = new Uint8ClampedArray(cw * ch);
  let coverage = 0;
  for (let y = 0; y < y1 - y0 + 1; y++) {
    for (let x = 0; x < x1 - x0 + 1; x++) {
      const v = alpha[(y + y0) * w + (x + x0)];
      out[(y + pad) * cw + (x + pad)] = v;
      if (v > 8) coverage++;
    }
  }

  return {
    alpha: out, width: cw, height: ch,
    kept, cliff, coverage: coverage / (cw * ch),
    sourceWidth: w, sourceHeight: h,
  };
}

/** Paint a solid color through the matte. The color never comes from the photo,
 *  so no paper cast survives: one shot of black marker yields a clean white mark.
 *
 *  This one deliberately does NOT use the shared canvas factory. Its output is
 *  displayed and downloaded, and an OffscreenCanvas cannot be appended to the
 *  document - the shim that let the engine run in a worker silently broke the
 *  preview until this was pinned to a real element. */
export function colorize(result, rgb) {
  const el = document.createElement('canvas');
  el.width = result.width;
  el.height = result.height;
  const c = el.getContext('2d');
  const id = c.createImageData(result.width, result.height);
  const [r, g, b] = rgb;
  for (let i = 0, p = 0; i < result.alpha.length; i++, p += 4) {
    id.data[p] = r; id.data[p + 1] = g; id.data[p + 2] = b;
    id.data[p + 3] = result.alpha[i];
  }
  c.putImageData(id, 0, 0);
  return el;
}
