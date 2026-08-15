/*
 * INKWELL - the interface.
 *
 * The engine lives in inkwell.js and runs in a worker. This module owns the page:
 * the drop target, the ink swatches in the crest nav, the preview stage, and the
 * readout card in the masthead.
 *
 * THE TOOL STANDARD gives that card to a live countdown. INKWELL counts down to
 * nothing, so the slot carries the extraction result instead: same frosted panel,
 * same monospace datum treatment, real numbers rather than a placeholder.
 */

import { extract, colorize, INKS } from './engine.js';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), file = $('file-input'), overlay = $('drop-overlay');
const stage = $('stage-result'), thumb = $('out-thumb'), err = $('input-error');
const cleanBox = $('clean'), invertBox = $('invert'), dl = $('download');
const rSrc = $('res-src'), rOut = $('res-out'), rMarks = $('res-marks');
const rCliff = $('res-cliff'), rCov = $('res-cov');
const hexInput = $('hex'), hexSwatch = $('hexswatch');

let result = null;
let sourceBlob = null;
let bitmap = null;
let ink = 'white';
let customRGB = null;     // set by the hex field; overrides the preset when present
let format = 'png';

/* The colour actually painted through the matte. A typed hex wins over a preset,
   which is what makes the swatches a shortcut rather than a limit. */
function currentRGB() { return customRGB || INKS[ink]; }
function currentHex() {
  const [r, g, b] = currentRGB();
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/* Decode on the main thread. Reached only when a worker is unavailable. */
async function decoded() {
  if (bitmap) return bitmap;
  try {
    bitmap = await createImageBitmap(sourceBlob, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('Could not decode that image.'));
      img.src = URL.createObjectURL(sourceBlob);
    });
  }
  return bitmap;
}

/* The swatches are built from the shared palette, so the page and the command
   line can never disagree about what gold means. */
for (const [name, rgb] of Object.entries(INKS)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ink';
  b.dataset.ink = name;
  b.title = name;
  b.setAttribute('aria-label', name);
  b.classList.toggle('is-on', name === ink);
  b.style.background = `rgb(${rgb.join(',')})`;
  b.addEventListener('click', () => {
    ink = name;
    customRGB = null;                       // a preset click clears a typed hex
    hexInput.value = '';
    hexInput.classList.remove('bad');
    hexSwatch.value = '#' + INKS[name].map((v) => v.toString(16).padStart(2, '0')).join('');
    for (const s of document.querySelectorAll('.ink')) s.classList.toggle('is-on', s.dataset.ink === name);
    paint(); refreshDownload();
  });
  $('inks').appendChild(b);
}

/* Any six digit hex. Three digit shorthand is expanded, because people type it. */
/* The swatch is a real colour input, so a click opens the system picker and a
   drag updates live. It and the hex field are two views of the same value: each
   writes the other, and a preset click clears both. */
hexSwatch.addEventListener('input', () => {
  const hex = hexSwatch.value.replace('#', '').toUpperCase();
  hexInput.value = hex;
  hexInput.classList.remove('bad');
  customRGB = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (const s of document.querySelectorAll('.ink')) s.classList.remove('is-on');
  paint(); refreshDownload();
});

hexInput.addEventListener('input', () => {
  const raw = hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  hexInput.value = raw.toUpperCase();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (full.length !== 6) {
    hexInput.classList.toggle('bad', raw.length > 0);
    if (raw.length === 0) { customRGB = null; paint(); refreshDownload(); }
    return;
  }
  hexInput.classList.remove('bad');
  customRGB = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  hexSwatch.value = '#' + full.toLowerCase();
  for (const s of document.querySelectorAll('.ink')) s.classList.remove('is-on');
  paint(); refreshDownload();
});

for (const b of document.querySelectorAll('#format-control .seg-btn')) {
  b.addEventListener('click', () => {
    format = b.dataset.fmt;
    for (const o of document.querySelectorAll('#format-control .seg-btn')) o.classList.toggle('is-on', o === b);
    refreshDownload();
  });
}

for (const b of document.querySelectorAll('#bg-control .seg-btn')) {
  b.addEventListener('click', () => {
    thumb.className = 'thumb big ' + b.dataset.bg;
    for (const o of document.querySelectorAll('#bg-control .seg-btn')) o.classList.toggle('is-on', o === b);
  });
}

function fail(message) {
  err.textContent = message;
  err.hidden = false;
}

function paint() {
  if (!result) return;
  thumb.replaceChildren(colorize(result, currentRGB()));
}

/* The readout, in SQUISH's dl/dt/dd shape. */
function report() {
  rSrc.textContent   = `${result.sourceWidth} x ${result.sourceHeight}`;
  rOut.textContent   = `${result.width} x ${result.height}`;
  rMarks.textContent = String(result.kept);
  rCliff.textContent = result.cliff ? `${Math.round(result.cliff)}x size cliff` : 'nothing to separate';
  rCov.textContent   = `${(result.coverage * 100).toFixed(1)}% of the canvas`;
}

/* The worker keeps a multi-megapixel extraction off the main thread, so the page
   stays scrollable and the controls stay live. Without one, the same engine runs
   inline. */
let worker = null;
try {
  worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
} catch {
  worker = null;
}

let job = 0;

function runInWorker(blob, opts) {
  return new Promise((resolve, reject) => {
    const id = ++job;
    const onDone = (e) => {
      if (e.data.id !== id) return;          // a stale job from a fast toggle
      worker.removeEventListener('message', onDone);
      e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error));
    };
    worker.addEventListener('message', onDone);
    worker.postMessage({ blob, opts, id });  // a Blob crosses by reference
  });
}

async function run() {
  if (!sourceBlob) return;
  err.hidden = true;

  const opts = { clean: cleanBox.checked, invert: invertBox.checked };

  try {
    result = worker
      ? await runInWorker(sourceBlob, opts)
      : (await new Promise((r) => setTimeout(r, 0)), extract(await decoded(), opts));
    paint();
    stage.classList.remove('hidden');
    report();
    refreshDownload();
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    stage.classList.add('hidden');
    fail(e.message || String(e));
  }
}

async function load(f) {
  if (!f) return;
  if (!f.type.startsWith('image/')) return fail('That is not an image file.');
  err.hidden = true;
  // Hold the file, not a decoded bitmap. Decoding belongs with the extraction,
  // and EXIF orientation is honoured wherever it happens.
  sourceBlob = f;
  bitmap = null;
  await run();
}

drop.addEventListener('click', () => file.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
});
file.addEventListener('change', (e) => load(e.target.files[0]));

for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('drag'); });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove('drag'); });
}
drop.addEventListener('drop', (e) => load(e.dataTransfer.files[0]));

/* A file dragged anywhere over the window raises the overlay, not just one over
   the drop target. Counting enter and leave events is what keeps it from
   flickering as the pointer crosses child elements. */
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  if (++dragDepth === 1) { overlay.hidden = false; overlay.setAttribute('aria-hidden', 'false'); }
});
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true'); }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0; overlay.hidden = true; overlay.setAttribute('aria-hidden', 'true');
  if (e.dataTransfer?.files?.length) load(e.dataTransfer.files[0]);
});

window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) load(item.getAsFile());
});

cleanBox.addEventListener('change', run);
invertBox.addEventListener('change', run);

/* One download button, three formats. PNG and WEBP come off the canvas; SVG is
   traced here in the browser rather than shelled out to potrace, which a page
   cannot do. */
function refreshDownload() {
  if (!result) return;
  if (dl.href.startsWith('blob:')) URL.revokeObjectURL(dl.href);

  const type = format === 'webp' ? 'image/webp' : 'image/png';
  colorize(result, currentRGB()).toBlob((blob) => {
    if (!blob) return;                       // WEBP is refused by a few old browsers
    if (dl.href.startsWith('blob:')) URL.revokeObjectURL(dl.href);
    dl.href = URL.createObjectURL(blob);
    dl.download = `inkwell-${currentHex().slice(1)}.${format}`;
  }, type, 0.95);
}

$('reset-1').addEventListener('click', () => {
  stage.classList.add('hidden');
  err.hidden = true;
  result = null;
  sourceBlob = null;
  bitmap = null;
  file.value = '';
  for (const el of [rSrc, rOut, rMarks, rCliff, rCov]) el.textContent = '-';
  drop.focus();
});
