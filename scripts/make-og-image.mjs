// Makes public/og-image.jpg: the picture chat apps show when a link to the site or to a shared deck is pasted (1200x630, like the landing hero:
// an old page of scripture, paper, the logo and the name). Run `node scripts/make-og-image.mjs` after changing the look; needs Playwright.
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const pub = (f) => pathToFileURL(resolve('public', f)).href;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Literata; src: url('${pub('fonts/literata-latin-wght-normal.woff2')}'); font-weight: 200 900; }
@font-face { font-family: 'Instrument Sans'; src: url('${pub('fonts/instrument-sans-latin-wght-normal.woff2')}'); font-weight: 400 700; }
html, body { margin: 0; width: 1200px; height: 630px; background: #f8f8f6; overflow: hidden; }
.bg { position: absolute; inset: 0; background: url('${pub('bg-light.webp')}') center/cover; opacity: .55; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent); }
.glow { position: absolute; inset: 0; background: radial-gradient(ellipse 55% 60% at 50% 48%, #f8f8f6 35%, transparent 80%); }
.card { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; font-family: 'Instrument Sans', sans-serif; color: #17171a; }
img { width: 168px; height: 168px; margin-bottom: 28px; }
h1 { font-family: Literata, serif; font-weight: 500; font-size: 84px; line-height: 1.05; letter-spacing: -0.02em; margin: 0 0 18px; }
p { font-size: 34px; color: #5e5e5a; margin: 0; }
</style>
<div class="bg"></div><div class="glow"></div>
<div class="card"><img src="${pub('logo.svg')}" alt=""><h1>Simple Bible Memory</h1><p>Learn Scripture by heart · Aprende la Escritura de memoria</p></div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
// A real file (not setContent): a page with no address may not load the local pictures and fonts.
const dir = mkdtempSync(join(tmpdir(), 'og-'));
const file = join(dir, 'og.html');
writeFileSync(file, html);
await page.goto(pathToFileURL(file).href);
await page.waitForTimeout(800);
await page.screenshot({ path: 'public/og-image.jpg', type: 'jpeg', quality: 88 });
await browser.close();
rmSync(dir, { recursive: true, force: true });
console.log('public/og-image.jpg written');
