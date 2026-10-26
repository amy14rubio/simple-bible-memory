/**
 * Makes the iPhone and iPad app icon and launch image from the logo:
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png  (1024 x 1024; Apple wants it square and with no transparency)
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732*.png      (the heart on paper; the three light copies are the template's 1x, 2x and 3x slots)
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-dark-2732x2732.png  (the heart on near-black, shown when the phone is in dark mode)
 * Run: node scripts/make-ios-assets.mjs   (needs the Playwright browsers that the tests already use, and ImageMagick's `magick`)
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SETS = path.join(ROOT, 'ios/App/App/Assets.xcassets');
const LOGO = pathToFileURL(path.join(ROOT, 'public/logo.svg')).href;
const PAPER = '#f8f8f6';
const NIGHT = '#131312';

// The logo's heart sits in the middle 684 x 588 of its 1024 x 1024 canvas (centre at x 512, y 505): size and place it by its heart.
const heart = (width, cx, cy) => {
  const img = (width * 1024) / 684;
  const s = img / 1024;
  return `<img src="${LOGO}" style="position:absolute;left:${cx - 512 * s}px;top:${cy - 505 * s}px;width:${img}px;height:${img}px">`;
};
const page = (size, bg, heartWidth) => `<div style="position:relative;width:${size}px;height:${size}px;background:${bg}">${heart(heartWidth, size / 2, size / 2)}</div>`;

const jobs = [
  [path.join(SETS, 'AppIcon.appiconset/AppIcon-512@2x.png'), 1024, PAPER, 640],
  [path.join(SETS, 'Splash.imageset/splash-2732x2732.png'), 2732, PAPER, 700],
  [path.join(SETS, 'Splash.imageset/splash-2732x2732-1.png'), 2732, PAPER, 700],
  [path.join(SETS, 'Splash.imageset/splash-2732x2732-2.png'), 2732, PAPER, 700],
  [path.join(SETS, 'Splash.imageset/splash-dark-2732x2732.png'), 2732, NIGHT, 700],
];

const work = mkdtempSync(path.join(tmpdir(), 'ios-assets-')); // a web page that points at the logo file has to be a file too, not inline
const browser = await chromium.launch();
for (const [file, size, bg, heartWidth] of jobs) {
  const p = await browser.newPage({ viewport: { width: size, height: size } });
  const html = path.join(work, 'page.html');
  writeFileSync(html, `<body style="margin:0">${page(size, bg, heartWidth)}</body>`);
  await p.goto(pathToFileURL(html).href);
  await p.waitForTimeout(300);
  await p.screenshot({ path: file });
  await p.close();
  execFileSync('magick', [file, '-alpha', 'off', file]); // no transparency
  console.log('wrote', path.relative(ROOT, file));
}
await browser.close();
