/*
 * The extraction, off the main thread.
 *
 * A four megapixel photograph takes roughly two seconds to extract. Run on the
 * main thread that is two seconds of frozen scroll, dead buttons, and a spinner
 * that cannot spin. The work is pure computation over typed arrays, so it moves
 * to a worker without changing a line of the engine: the canvas factory already
 * prefers OffscreenCanvas, which exists here.
 *
 * The matte comes back as a transferred buffer rather than a copy, so a several
 * megabyte result crosses the boundary in constant time.
 */

import { extract } from './inkwell.js';

self.onmessage = async (e) => {
  const { blob, opts, id } = e.data;
  let bitmap = null;
  try {
    // Decoding happens here rather than on the main thread. A Blob crosses the
    // boundary by reference, so passing the file itself costs nothing, while
    // transferring a decoded bitmap neuters it and forces the sender to make a
    // copy for every subsequent run.
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const r = extract(bitmap, opts);
    self.postMessage({ id, ok: true, result: r }, [r.alpha.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message || String(err) });
  } finally {
    if (bitmap && bitmap.close) bitmap.close();
  }
};
