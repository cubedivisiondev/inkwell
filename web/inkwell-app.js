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

import { extract, colorize, INKS } from './inkwell.js';

const $ = (id) => document.getElementById(id);
const drop = $('drop'), file = $('file'), panel = $('panel'), stage = $('stage');
const busy = $('busy'), err = $('err');
const cleanBox = $('clean'), invertBox = $('invert');
const outName = $('next-name'), outWhen = $('next-when');
const outCount = $('count'), outLbl = $('count-lbl');

let result = null;
let sourceBlob = null;
let bitmap = null;
let ink = 'white';

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
  b.setAttribute('aria-pressed', String(name === ink));
  b.style.background = `rgb(${rgb.join(',')})`;
  b.addEventListener('click', () => {
    ink = name;
    for (const s of document.querySelectorAll('.ink')) {
      s.setAttribute('aria-pressed', String(s.dataset.ink === name));
    }
    paint();
  });
  $('inks').appendChild(b);
}

for (const b of document.querySelectorAll('.bgpick button')) {
  b.addEventListener('click', () => {
    stage.className = b.dataset.bg;
    for (const o of document.querySelectorAll('.bgpick button')) {
      o.setAttribute('aria-pressed', String(o === b));
    }
  });
}

function fail(message) {
  err.textContent = message;
  err.classList.add('on');
  busy.classList.remove('on');
  outName.textContent = 'Extraction failed';
  outWhen.textContent = message;
  outCount.firstChild.nodeValue = '--';
  outLbl.textContent = 'marks kept';
}

function paint() {
  if (!result) return;
  stage.replaceChildren(colorize(result, INKS[ink]));
}

/* Written as nodes rather than markup. The values are all locally computed, but
   assembling text into HTML is a habit worth not having. */
function report(ms) {
  outName.textContent = `${result.sourceWidth} x ${result.sourceHeight} in, ${result.width} x ${result.height} out`;
  outWhen.textContent = result.cliff
    ? `${ms} ms - Separated at a ${Math.round(result.cliff)}x size cliff - `
      + `${(result.coverage * 100).toFixed(1)}% of the canvas carries ink`
    : `${ms} ms - No artifacts to separate - `
      + `${(result.coverage * 100).toFixed(1)}% of the canvas carries ink`;
  // The count is meaningful whether or not a cliff was found: despeckle still
  // reports what it kept when the distribution had no separation to act on.
  outCount.firstChild.nodeValue = String(result.kept);
  outLbl.textContent = result.kept === 1 ? 'mark kept' : 'marks kept';
}

/* The worker keeps a multi-megapixel extraction off the main thread, so the page
   stays scrollable and the controls stay live. Without one, the same engine runs
   inline. */
let worker = null;
try {
  worker = new Worker('/worker.js', { type: 'module' });
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
  err.classList.remove('on');
  busy.classList.add('on');
  outName.textContent = 'Reading the paper';
  outWhen.textContent = 'Modelling the light on the page';

  const opts = { clean: cleanBox.checked, invert: invertBox.checked };
  const t0 = performance.now();

  try {
    result = worker
      ? await runInWorker(sourceBlob, opts)
      : (await new Promise((r) => setTimeout(r, 0)), extract(await decoded(), opts));
    paint();
    panel.classList.add('on');
    report(Math.round(performance.now() - t0));
  } catch (e) {
    panel.classList.remove('on');
    fail(e.message || String(e));
  } finally {
    busy.classList.remove('on');
  }
}

async function load(f) {
  if (!f) return;
  if (!f.type.startsWith('image/')) return fail('That is not an image file.');
  err.classList.remove('on');
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
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('hot'); });
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove('hot'); });
}
drop.addEventListener('drop', (e) => load(e.dataTransfer.files[0]));

window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) load(item.getAsFile());
});

cleanBox.addEventListener('change', run);
invertBox.addEventListener('change', run);

$('save').addEventListener('click', () => {
  if (!result) return;
  colorize(result, INKS[ink]).toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `inkwell-${ink}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

$('again').addEventListener('click', () => {
  panel.classList.remove('on');
  err.classList.remove('on');
  result = null;
  sourceBlob = null;
  bitmap = null;
  file.value = '';
  outName.textContent = 'No photograph yet';
  outWhen.textContent = 'Drop one below to begin';
  outCount.firstChild.nodeValue = '--';
  outLbl.textContent = 'marks kept';
  drop.focus();
});
