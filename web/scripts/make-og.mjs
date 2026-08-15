/* make-og.mjs - PUDDY house-style social cards for INKWELL.
 *
 * The same card system SQUISH ships (puddy-studios/script/_squish-og-card.mjs),
 * which is itself the canonical page-card pipeline: five formats, Futura PT Bold
 * embedded as base64 so the render does not depend on an installed face, the
 * same landscape and stack layout math, the same 2x Playwright screenshot.
 *
 * Three departures:
 *
 *   1. THE SLOT IS NOT SQUARE. SQUISH's mark is a wide face and sits in a square
 *      box. The INKWELL pen is 746 by 1417, so a square box would letterbox it
 *      and leave half the slot empty. The slot carries the glyph's own aspect
 *      and the layouts size it by HEIGHT.
 *   2. NO EYEBROW ON LANDSCAPE. Removing the pen's dead width gives the text
 *      column room for a larger hook, and the brand mark already sits in the
 *      corner, so a third line of "Puddy Studios" was three of the same words
 *      on one card.
 *   3. REAL TEXT MEASUREMENT, taken from SUNMAP (sun_map/scripts/generate-og.mjs)
 *      where it is already documented as the correction to this pipeline. The
 *      reference estimates glyph width from a single constant, 0.72 of the type
 *      size per capital. That constant treats a space like a letter, so a hook
 *      with three spaces in it comes out around a quarter narrower than the
 *      estimate and the type is set far smaller than the card can carry. The
 *      size is binary searched against the browser's own measurement instead.
 *
 *   landscape  1200x630   og-card.png          -> og:image / twitter:image
 *   square     1080x1080  og-card-square.png
 *   story      1080x1920  og-card-story.png
 *   pinterest  1000x1500  og-card-pin.png
 *   youtube    1280x720   og-card-youtube.png
 *
 * All render at deviceScaleFactor 2, so og-card.png is 2400x1260 actual pixels,
 * which is what index.html declares in og:image:width and og:image:height.
 *
 *   node scripts/make-og.mjs
 *
 * Output: inkwell/web/og-card*.png + _og_gallery.html, all at the bucket root
 * because that is where the meta tags point. Review the gallery before a prod
 * cutover: https://inkwell.puddy.dev/_og_gallery.html
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');   // inkwell/web/
const REPO = resolve(WEB, '..', '..');                               // Puddy Studios/

const CARD = {
  hookLines: ['INKWELL:', 'Lift Ink Off Paper'],
  brand: 'Puddy Studios',
  url: 'inkwell.puddystudios.com',
};

// The pen's intrinsic box, from the traced SVG. The slot uses this ratio so the
// glyph fills it rather than letterboxing inside a square.
const GLYPH_ASPECT = 746 / 1417;

const FORMATS = [
  { suffix: '',         width: 1200, height: 630,  layout: 'landscape' },
  { suffix: '-square',  width: 1080, height: 1080, layout: 'stack' },
  { suffix: '-story',   width: 1080, height: 1920, layout: 'stack' },
  { suffix: '-pin',     width: 1000, height: 1500, layout: 'stack' },
  { suffix: '-youtube', width: 1280, height: 720,  layout: 'landscape' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- hook fitting --------------------------------------------------------
// The layout reserves a column; the browser decides what type size fills it.
// Nothing here assumes a per-face width constant, so changing the hook wording
// or the face needs no re-tuning.
const SAFE_WIDTH_FRACTION = 0.94;

// Height of the pen as a fraction of the card's short side (landscape) or width
// (stack). Taller than SQUISH's 0.57 because the glyph is narrow: the same
// visual weight needs more height when it has half the width.
function glyphHeightFor(fmt) {
  if (fmt.layout === 'landscape') return Math.min(fmt.width, fmt.height) * 0.74;
  if (fmt.height >= 1800) return fmt.width * 0.86;
  if (fmt.width === fmt.height) return fmt.width * 0.52;
  return fmt.width * 0.66;
}

function hookColumnBudget(fmt) {
  if (fmt.layout === 'landscape') {
    const padX = fmt.width * 0.06;
    const gap = fmt.width * 0.05;
    const glyphW = glyphHeightFor(fmt) * GLYPH_ASPECT;
    return {
      colWidth: fmt.width - 2 * padX - gap - glyphW,
      colHeight: fmt.height * 0.62,
      fontMax: 130,
    };
  }
  const padX = fmt.width * 0.07;
  const padY = fmt.height * 0.07;
  const glyphH = glyphHeightFor(fmt);
  const eyebrowSize = fmt.width * 0.018;
  const brandHeight = fmt.width * 0.06;
  return {
    colWidth: fmt.width - 2 * padX,
    colHeight: fmt.height - 2 * padY - glyphH - eyebrowSize - brandHeight - fmt.height * 0.06,
    fontMax: 220,
  };
}

/* Set the hook to the largest size where no line overflows its column and the
 * block still fits the height budget. Runs in the page after the face has
 * loaded, so the measurement is the browser's, not an estimate. */
async function fitHookInPage(tab, fmt) {
  const { colHeight, fontMax } = hookColumnBudget(fmt);
  return tab.evaluate(({ fontMax: max, budget }) => {
    const frame = document.querySelector('.hook-frame');
    const lines = [...frame.querySelectorAll('.hook-line')];
    const fits = (px) => {
      lines.forEach((l) => { l.style.fontSize = px + 'px'; });
      lines.forEach((l) => { l.style.marginTop = ''; });
      lines.slice(1).forEach((l) => { l.style.marginTop = Math.round(px * 0.05) + 'px'; });
      return lines.every((l) => l.scrollWidth <= frame.clientWidth) && frame.scrollHeight <= budget;
    };
    if (fits(max)) return max;
    let lo = 12, hi = max;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) lo = mid; else hi = mid;
    }
    const final = Math.max(40, Math.floor(lo));
    fits(final);
    return final;
  }, { fontMax, budget: colHeight });
}

// ---- card template -------------------------------------------------------
// The type size is a placeholder here; fitHookInPage overwrites it after load.
function htmlForCard(fmt, futuraB64, glyphSvg) {
  const hookSize = 64;
  const hookHtml = CARD.hookLines.map((l) => `<div class="hook-line">${esc(l)}</div>`).join('\n      ');
  const hookMaxHeight = Math.round(hookColumnBudget(fmt).colHeight);
  const glyphH = Math.round(glyphHeightFor(fmt));
  const glyphW = Math.round(glyphH * GLYPH_ASPECT);

  const head = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face {
  font-family: 'Futura PT';
  src: url(data:font/woff;base64,${futuraB64}) format('woff');
  font-weight: 700;
  font-display: block;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${fmt.width}px; height: ${fmt.height}px; background: #000; }
body {
  font-family: 'Futura PT', 'Trebuchet MS', Arial, sans-serif;
  color: #fff;
  -webkit-font-smoothing: antialiased;
  overflow: hidden;
}
.glyph { width: ${glyphW}px; height: ${glyphH}px; flex-shrink: 0; }
.glyph svg { width: 100%; height: 100%; display: block; }
.hook-line { font-weight: 700; line-height: 1.0; letter-spacing: 0.005em; text-transform: uppercase; color: #fff; font-size: ${hookSize}px; white-space: nowrap; }
.hook-line + .hook-line { margin-top: ${Math.round(hookSize * 0.05)}px; }
/* max-height, not height: the frame hugs its text so the leftover space is
   distributed by the flex parent instead of pooling into one dead band. */
.hook-frame { width: ${SAFE_WIDTH_FRACTION * 100}%; max-height: ${hookMaxHeight}px; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }`;

  if (fmt.layout === 'landscape') {
    const padX = Math.round(fmt.width * 0.06);
    const padY = Math.round(fmt.height * 0.095);
    const gap = Math.round(fmt.width * 0.05);
    const brandSize = Math.round(fmt.width * 0.0166);
    const urlSize = Math.round(fmt.width * 0.015);
    return `${head}
body { display: flex; align-items: center; padding: ${padY}px ${padX}px; gap: ${gap}px; }
.text { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.hook-frame { align-items: flex-start; }
.brand-mark { position: absolute; top: ${Math.round(padY * 0.83)}px; right: ${padX}px; font-size: ${brandSize}px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: rgba(255,255,255,0.7); }
.url-strip { position: absolute; bottom: ${Math.round(padY * 0.83)}px; left: ${padX}px; right: ${padX}px; text-align: center; font-size: ${urlSize}px; font-weight: 700; letter-spacing: 0.15em; color: rgba(255,255,255,0.45); }
</style></head>
<body>
  <div class="brand-mark">${esc(CARD.brand)}</div>
  <div class="glyph">${glyphSvg}</div>
  <div class="text">
    <div class="hook-frame">
      ${hookHtml}
    </div>
  </div>
  <div class="url-strip">${esc(CARD.url)}</div>
</body></html>`;
  }

  // Stacked: three bands, eyebrow over centerpiece over brand.
  const padX = Math.round(fmt.width * 0.07);
  const padY = Math.round(fmt.height * 0.07);
  const eyebrowSize = Math.round(fmt.width * 0.018);
  // brandSize removed with the duplicate name band.
  const urlSize = Math.round(fmt.width * 0.018);
  const centerGap = Math.round(fmt.height * 0.04);
  return `${head}
body { display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: ${padY}px ${padX}px; text-align: center; }
.eyebrow { font-size: ${eyebrowSize}px; font-weight: 700; letter-spacing: 0.35em; text-transform: uppercase; color: rgba(255,255,255,0.55); }
.centerpiece { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${centerGap}px; width: 100%; }
.hook-frame { align-items: center; width: 100%; }
.hook-line { text-align: center; }
/* The reference stack prints the brand name in BOTH the eyebrow and this block.
   One card, two identical words, so the lower one is dropped: the eyebrow reads
   the brand and the foot reads the address, which is how the landscape card is
   laid out too. */
.brand { display: flex; flex-direction: column; align-items: center; gap: ${Math.round(eyebrowSize * 0.8)}px; }
.brand .url { font-size: ${urlSize}px; font-weight: 700; letter-spacing: 0.15em; color: rgba(255,255,255,0.45); }
</style></head>
<body>
  <div class="eyebrow">${esc(CARD.brand)}</div>
  <div class="centerpiece">
    <div class="glyph">${glyphSvg}</div>
    <div class="hook-frame">
      ${hookHtml}
    </div>
  </div>
  <div class="brand">
    <span class="url">${esc(CARD.url)}</span>
  </div>
</body></html>`;
}

// ---- run -----------------------------------------------------------------
// Futura PT Bold is licensed. It is embedded here at BUILD time only, into a
// throwaway page that exists for the duration of one screenshot, and no font
// binary reaches the cards or the repository through this script. The face
// already ships to the browser from web/fonts/ under the same license terms as
// every other PUDDY surface.
const futuraB64 = readFileSync(join(WEB, 'fonts/FuturaCyrillicBold.woff')).toString('base64');

// logo-glyph.svg is the white-filled variant. The card is always black, so the
// white fill is correct as authored and nothing needs recoloring.
const glyphSvg = readFileSync(join(WEB, 'logo-glyph.svg'), 'utf8').trim();

let chromium;
for (const base of [join(WEB, 'package.json'), join(REPO, 'puddy-studios/package.json')]) {
  try { ({ chromium } = createRequire(base)('playwright')); break; } catch { /* next */ }
}
if (!chromium) {
  console.error('FATAL: playwright not resolvable from inkwell/web/ or puddy-studios/.');
  console.error('       Install with: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

console.log(`INKWELL OG cards - 1 card x ${FORMATS.length} formats, pen centerpiece`);
const browser = await chromium.launch();
for (const fmt of FORMATS) {
  const context = await browser.newContext({
    viewport: { width: fmt.width, height: fmt.height },
    deviceScaleFactor: 2,
  });
  const tab = await context.newPage();
  await tab.setContent(htmlForCard(fmt, futuraB64, glyphSvg), { waitUntil: 'load' });
  await tab.evaluateHandle('document.fonts.ready');
  const hookSize = await fitHookInPage(tab, fmt);
  await tab.screenshot({
    path: join(WEB, `og-card${fmt.suffix}.png`),
    type: 'png',
    clip: { x: 0, y: 0, width: fmt.width, height: fmt.height },
  });
  await tab.close();
  await context.close();
  console.log(`  og-card${fmt.suffix}.png`.padEnd(28)
    + `${fmt.width}x${fmt.height} css -> ${fmt.width * 2}x${fmt.height * 2} px  hook ${hookSize}px`);
}
await browser.close();

// ---- review gallery ------------------------------------------------------
const GALLERY = [
  { suffix: '',         label: 'Landscape 1200x630' },
  { suffix: '-youtube', label: 'YouTube 1280x720' },
  { suffix: '-square',  label: 'Square 1080x1080' },
  { suffix: '-pin',     label: 'Pin 1000x1500' },
  { suffix: '-story',   label: 'Story 1080x1920' },
];
const grid = GALLERY.map((f) => `<div class="card">
      <div class="image-wrap"><img src="og-card${f.suffix}.png" loading="lazy" alt="${f.label}"></div>
      <div class="label">${f.label}</div>
    </div>`).join('\n    ');

writeFileSync(join(WEB, '_og_gallery.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>INKWELL OG Gallery</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<style>
body { margin: 0; padding: 40px; background: #111; color: #fff; font-family: 'Trebuchet MS', Arial, sans-serif; }
h1 { font-size: 28px; font-weight: 700; letter-spacing: 0.05em; margin: 0 0 8px; }
.sub { color: #aaa; font-size: 13px; margin-bottom: 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; align-items: start; }
.image-wrap { background: #000; line-height: 0; border-radius: 4px; overflow: hidden; }
.image-wrap img { display: block; width: 100%; height: auto; }
.card .label { margin-top: 8px; background: #1a1a1a; border: 1px solid #2a2a2a; border-left: 3px solid #6a6a6a;
  font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #c0c0c0; padding: 7px 12px; border-radius: 3px; }
</style></head><body>
<h1>INKWELL - OG Card Gallery</h1>
<div class="sub">1 card x ${GALLERY.length} formats, generated by scripts/make-og.mjs. Review before a prod cutover.</div>
<div class="grid">
    ${grid}
</div>
</body></html>`);
console.log('  _og_gallery.html');
