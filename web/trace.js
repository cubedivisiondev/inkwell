/*
 * NOT WIRED. This tracer is incomplete and the UI does not offer SVG.
 *
 * The contour follower closes correctly on a filled square (one contour, forty
 * points) and on a diagonal, but fails on any shape with a hole: an interior
 * contour winds the opposite way to an exterior one, and a single direction
 * table cannot follow both. On a real signature it emitted 474 subpaths, 472 of
 * them under four points, which is fragments rather than outlines.
 *
 * Kept because the marching-squares walk and the Ramer-Douglas-Peucker pass are
 * both sound and worth finishing. What it needs is orientation-aware seeding, so
 * a hole is entered with the direction its winding requires.
 *
 * Vector export works today in the command line tool, which shells out to
 * potrace. Use that for foil, letterpress and cutting work.
 *
 * Vector tracing, in the browser, with no dependencies.
 *
 * The command line tool shells out to potrace for this. A browser cannot, so the
 * contour follower is written out here: marching squares to walk the boundary
 * between ink and paper, then Ramer-Douglas-Peucker to drop the points that sit
 * on a line already described by their neighbors.
 *
 * Vector is the one place a threshold is correct. A curve has no anti-aliasing to
 * preserve, because the curve IS the edge. Everywhere else in INKWELL the
 * grayscale ramp is kept exactly because thresholding destroys it.
 *
 * Foil, letterpress, embossing and vinyl cutting all need this. Those are cut
 * from a physical plate or driven by a blade, and the machine needs a closed
 * outline rather than a grid of pixels.
 */

/* Walk one closed contour from a starting edge, using the four-cell neighborhood
 * to decide each turn. Standard marching squares, with the ambiguous saddle cases
 * resolved consistently so a diagonal touch never splits a stroke in two. */
function followContour(mask, w, h, startX, startY, seen) {
  const pts = [];
  let x = startX, y = startY, dir = 0;

  const at = (px, py) => (px < 0 || py < 0 || px >= w || py >= h) ? 0 : mask[py * w + px];

  for (let guard = 0; guard < w * h * 4; guard++) {
    pts.push([x, y]);
    seen.add(y * (w + 1) + x);

    // The 2x2 cell straddling the current lattice point.
    const tl = at(x - 1, y - 1), tr = at(x, y - 1);
    const bl = at(x - 1, y), br = at(x, y);
    const state = (tl << 3) | (tr << 2) | (bl << 1) | br;

    let nd;
    switch (state) {
      case 1: case 5: case 13: nd = 2; break;                     // down
      case 2: case 3: case 7:  nd = 1; break;                     // right
      case 4: case 12: case 14: nd = 0; break;                    // up
      case 8: case 10: case 11: nd = 3; break;                    // left
      case 6:  nd = (dir === 0) ? 1 : 3; break;                   // saddle
      case 9:  nd = (dir === 1) ? 2 : 0; break;                   // saddle
      default: return pts;                                        // 0 or 15: off the boundary
    }

    dir = nd;
    if (nd === 0) y--; else if (nd === 1) x++; else if (nd === 2) y++; else x--;
    if (x === startX && y === startY) break;
  }
  return pts;
}

/* Ramer-Douglas-Peucker. Iterative rather than recursive so a long coastline
 * cannot blow the stack. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];

  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1, worstI = -1;

    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > worst) { worst = d; worstI = i; }
    }
    if (worst > tol) {
      keep[worstI] = 1;
      stack.push([a, worstI], [worstI, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Trace an extraction to an SVG document.
 *
 * @param {{alpha: Uint8ClampedArray, width: number, height: number}} result
 * @param {{threshold?: number, tolerance?: number, color?: string}} opts
 * @returns {string} SVG source
 */
export function toSVG(result, opts = {}) {
  const { threshold = 110, tolerance = 0.7, color = '#000000' } = opts;
  const { width: w, height: h, alpha } = result;

  const mask = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) mask[i] = alpha[i] > threshold ? 1 : 0;

  const seen = new Set();
  const paths = [];

  // Every lattice point where a filled cell meets an empty one starts a contour,
  // unless a previous walk already covered it.
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      if (seen.has(y * (w + 1) + x)) continue;
      const tl = (x > 0 && y > 0) ? mask[(y - 1) * w + (x - 1)] : 0;
      const tr = (y > 0 && x < w) ? mask[(y - 1) * w + x] : 0;
      const bl = (x > 0 && y < h) ? mask[y * w + (x - 1)] : 0;
      const br = (x < w && y < h) ? mask[y * w + x] : 0;
      const state = (tl << 3) | (tr << 2) | (bl << 1) | br;
      if (state === 0 || state === 15) continue;

      const contour = simplify(followContour(mask, w, h, x, y, seen), tolerance);
      if (contour.length < 3) continue;
      paths.push('M' + contour.map(([px, py]) => `${px} ${py}`).join('L') + 'Z');
    }
  }

  // One path, even-odd fill: counters and holes drop out on their own rather than
  // needing to be identified and subtracted.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<path fill="${color}" fill-rule="evenodd" d="${paths.join('')}"/>
</svg>`;
}
