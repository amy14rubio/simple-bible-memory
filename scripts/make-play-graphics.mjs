/**
 * Makes the Google Play store graphics from the logo and the app's own fonts:
 *   docs/play-assets/icon-512.png                 (512 x 512, the app icon)
 *   docs/play-assets/feature-graphic-1024x500.png (1024 x 500, the banner at the top of the store listing)
 * Run: node scripts/make-play-graphics.mjs   (needs the Playwright browsers that the tests already use)
 * Change the tagline below, run it again, and look at the two files.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'docs/play-assets');
const LOGO = pathToFileURL(path.join(ROOT, 'public/logo.svg')).href;
const font = (pkg, file) => pathToFileURL(path.join(ROOT, 'node_modules/@fontsource-variable', pkg, 'files', file)).href;
const PAPER = '#f8f8f6';
const INK = '#17171a';
const MUTED = '#5e5e5a';
const TAGLINE = 'Learn Scripture by heart.';

// The logo's heart sits in the middle 684 x 588 of its 1024 x 1024 canvas (centre at x 512, y 505): size and place it by its heart.
const heart = (width, left, top) => {
  const img = (width * 1024) / 684;
  const s = img / 1024;
  return `<img src="${LOGO}" style="position:absolute;left:${left - 512 * s}px;top:${top - 505 * s}px;width:${img}px;height:${img}px">`;
};
const fonts = `
@font-face { font-family: Literata; src: url(${font('literata', 'literata-latin-wght-normal.woff2')}); font-weight: 200 900; }
@font-face { font-family: InstrumentSans; src: url(${font('instrument-sans', 'instrument-sans-latin-wght-normal.woff2')}); font-weight: 400 700; }`;

const pages = {
  'icon-512.png': { w: 512, h: 512, html: `<div style="position:relative;width:512px;height:512px;background:${PAPER}">${heart(320, 256, 256)}</div>` },
  'feature-graphic-1024x500.png': {
    w: 1024,
    h: 500,
    html: `<div style="position:relative;width:1024px;height:500px;background:${PAPER}">
      ${heart(300, 250, 250)}
      <div style="position:absolute;left:450px;top:0;height:500px;width:520px;display:flex;flex-direction:column;justify-content:center;gap:18px">
        <div style="font:600 62px/1.1 Literata,Georgia,serif;color:${INK};letter-spacing:-0.5px">Simple Bible Memory</div>
        <div style="font:400 30px/1.3 InstrumentSans,system-ui,sans-serif;color:${MUTED}">${TAGLINE}</div>
      </div></div>`,
  },
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
for (const [name, { w, h, html }] of Object.entries(pages)) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const file = path.join(OUT, `.${name}.html`);
  writeFileSync(file, `<html><head><style>${fonts} body{margin:0}</style></head><body>${html}</body></html>`);
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, name) });
  await page.close();
  (await import('node:fs')).unlinkSync(file);
}
await browser.close();
console.log('Wrote', Object.keys(pages).map((n) => `docs/play-assets/${n}`).join(' and '));
