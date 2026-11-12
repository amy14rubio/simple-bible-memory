import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { test, type Browser, type Locator, type Page } from '@playwright/test';
import { en } from '../../src/i18n/messages.en';
import { es } from '../../src/i18n/messages.es';

/**
 * Records the short looping clips the welcome tour shows (public/tutorial/<lang>/<name>.mp4, with a still <name>.jpg for people who
 * ask for less motion). The real app is driven in a phone-sized browser: nothing here is a mock-up, so a clip can be made again
 * whenever the app changes. Needs ffmpeg. `npm run clips`.
 */
/** A wide 4:3 window (a phone's screen is too tall for the welcome card). Under 700 px high, so the app keeps its phone layout and sizes. */
const SIZE = { width: 480, height: 360 };
const OUT = 'public/tutorial';
const TMP = resolve('scripts/clips/.tmp'); // absolute: ffmpeg reads file names in a list relative to the list itself

type Dict = Record<string, unknown>;
const text = (m: Dict, key: string) => m[key] as string;

/**
 * What a viewer's eyes follow: a mouse pointer that glides to whatever is pressed, and a soft ring (a click) where it lands.
 * (A finger is invisible in a recording; a moving pointer is easy to track.)
 */
const RIPPLE = `(() => {
  const pointer = () => {
    let c = document.getElementById('clip-cursor');
    if (!c) {
      c = document.createElement('div');
      c.id = 'clip-cursor';
      c.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.45))"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      // A popover lives in the browser's "top layer", the same place a modal dialog is drawn, so it is not hidden behind one.
      c.setAttribute('popover', 'manual');
      c.style.cssText = 'position:fixed;inset:auto;left:0;top:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;z-index:2147483647;pointer-events:none;opacity:0;transform:translate(-999px,-999px)';
      document.body.appendChild(c);
      c.showPopover();
    }
    return c;
  };
  // Whatever is shown on top layer last is on top, so when something new opens (a menu, a drawer) the pointer is shown again, above it.
  let promoting = 0;
  new MutationObserver(() => {
    clearTimeout(promoting);
    promoting = setTimeout(() => { const c = document.getElementById('clip-cursor'); if (c && c.matches(':popover-open')) { c.hidePopover(); c.showPopover(); } }, 40);
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  // Starts near the bottom right of the screen, then glides to each thing that is pressed.
  window.__showCursor = () => { const c = pointer(); c.style.transition = 'none'; c.style.transform = 'translate(' + (innerWidth - 70) + 'px,' + (innerHeight - 60) + 'px)'; c.style.opacity = '1'; c.getBoundingClientRect(); };
  window.__moveCursor = (x, y) => { const c = pointer(); c.style.opacity = '1'; c.style.transition = 'transform .7s cubic-bezier(.4,0,.2,1)'; c.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 3) + 'px)'; };
  document.addEventListener('pointerdown', (e) => {
    const c = document.getElementById('clip-cursor');
    if (c) c.firstElementChild.animate([{ transform: 'scale(1)' }, { transform: 'scale(.82)' }, { transform: 'scale(1)' }], { duration: 280 });
    const d = document.createElement('div');
    d.style.cssText = 'inset:auto;margin:0;padding:0;overflow:visible;position:fixed;left:' + (e.clientX - 24) + 'px;top:' + (e.clientY - 24) + 'px;width:48px;height:48px;border-radius:50%;background:rgba(90,90,90,.28);border:2px solid rgba(90,90,90,.55);z-index:2147483646;pointer-events:none;transition:transform .55s ease-out,opacity .55s ease-out';
    d.setAttribute('popover', 'manual');
    document.body.appendChild(d);
    d.showPopover();
    requestAnimationFrame(() => { d.style.transform = 'scale(1.7)'; d.style.opacity = '0'; });
    setTimeout(() => d.remove(), 650);
  }, true);
})();`;

/** Pages whose clicks should show the pointer gliding over first (only while the demo itself runs, not the setup before it). */
const pointerOn = new WeakSet<Page>();
let clickPatched = false;
function glideBeforeClicks(page: Page) {
  if (clickPatched) return;
  clickPatched = true;
  const proto = Object.getPrototypeOf(page.locator('html')) as { click: (this: Locator, o?: unknown) => Promise<void> };
  const original = proto.click;
  proto.click = async function (this: Locator, options?: unknown) {
    const p = this.page();
    if (pointerOn.has(p)) {
      await this.scrollIntoViewIfNeeded();
      const box = await this.boundingBox();
      if (box) {
        await p.evaluate(([x, y]) => (window as unknown as { __moveCursor: (x: number, y: number) => void }).__moveCursor(x!, y!), [box.x + box.width / 2, box.y + box.height / 2]);
        await p.waitForTimeout(780); // the pointer arrives, then the click
      }
    }
    return original.call(this, options);
  };
}

const pause = (page: Page, ms = 900) => page.waitForTimeout(ms);

const VERSES: [string, string][] = [
  ['Psalm 23:1', 'The Lord is my shepherd; I shall not want.'],
  ['Psalm 23:2', 'He makes me lie down in green pastures. He leads me beside still waters.'],
  ['Psalm 23:3', 'He restores my soul. He leads me in paths of righteousness for his name’s sake.'],
];
const VERSES_ES: [string, string][] = [
  ['Salmo 23:1', 'El Señor es mi pastor; nada me faltará.'],
  ['Salmo 23:2', 'En lugares de delicados pastos me hará descansar; junto a aguas de reposo me pastoreará.'],
  ['Salmo 23:3', 'Confortará mi alma; me guiará por sendas de justicia por amor de su nombre.'],
];

async function newPage(browser: Browser, lang: 'en' | 'es') {
  const context = await browser.newContext({ viewport: SIZE, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'light', locale: lang === 'es' ? 'es-ES' : 'en-US' });
  await context.addInitScript(RIPPLE);
  const page = await context.newPage();
  return { context, page };
}

/** A deck with three cards, made quietly before the camera is "on" (the clip is trimmed to start after this). */
async function setupDeck(page: Page, lang: 'en' | 'es', title: string, cards = 3) {
  await page.goto('/#/collections/new');
  await page.getByLabel(lang === 'es' ? 'Título' : 'Title').fill(title);
  await page.getByRole('button', { name: lang === 'es' ? 'Guardar' : 'Save' }).click();
  await page.waitForURL(/#\/collections\/[0-9a-f-]{36}$/);
  const id = page.url().match(/#\/collections\/([0-9a-f-]{36})$/)![1]!;
  for (const [reference, passage] of (lang === 'es' ? VERSES_ES : VERSES).slice(0, cards)) {
    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel(lang === 'es' ? 'Versículo(s)' : 'Verse(s)').fill(reference);
    await page.getByLabel(lang === 'es' ? 'Pasaje' : 'Passage', { exact: true }).fill(passage);
    await page.getByRole('button', { name: lang === 'es' ? 'Guardar' : 'Save' }).click();
    await page.waitForTimeout(400);
  }
  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(title) }).waitFor(); // the home screen is really there before the clip starts
  await page.waitForTimeout(500);
  return id;
}

/**
 * Records `demo` as the browser's own screencast at the phone's real pixel density (the built-in video recording is only 1x and
 * leaves the picture in a corner), trims the setup off the front, and writes a small mp4 (+ a still of the last frame).
 */
async function clip(browser: Browser, lang: 'en' | 'es', name: string, setup: (p: Page) => Promise<unknown>, demo: (p: Page) => Promise<void>) {
  const { context, page } = await newPage(browser, lang);
  const cdp = await context.newCDPSession(page);
  const frames: { t: number; file: string }[] = [];
  let n = 0;
  cdp.on('Page.screencastFrame', (e) => {
    const file = `${TMP}/${lang}-${name}-${n++}.jpg`;
    writeFileSync(file, Buffer.from(e.data, 'base64'));
    frames.push({ t: e.metadata.timestamp ?? Date.now() / 1000, file });
    void cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => undefined);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: SIZE.width * 2, maxHeight: SIZE.height * 2, everyNthFrame: 1 });
  glideBeforeClicks(page);
  await setup(page);
  pointerOn.add(page);
  await page.evaluate(() => (window as unknown as { __showCursor: () => void }).__showCursor());
  const start = Date.now() / 1000 + 0.2;
  await pause(page, 200);
  await demo(page);
  await pause(page, 700);
  const end = Date.now() / 1000;
  await pause(page, 200);
  await cdp.send('Page.stopScreencast').catch(() => undefined);
  await context.close();

  // From the last frame before `start` (what was on screen as it began) to `end`, each frame held until the next one arrives.
  const before = frames.filter((f) => f.t <= start).at(-1);
  const kept = [...(before ? [{ ...before, t: start }] : []), ...frames.filter((f) => f.t > start && f.t <= end)];
  const list = kept.map((f, i) => `file '${f.file.replace(/'/g, "'\\''")}'\nduration ${Math.max(0.04, (kept[i + 1]?.t ?? end + 0.1) - f.t).toFixed(3)}`).join('\n');
  const listFile = `${TMP}/${lang}-${name}.txt`;
  writeFileSync(listFile, `${list}\nfile '${kept.at(-1)!.file}'\n`);
  const dir = `${OUT}/${lang}`;
  mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `fps=25,scale=${SIZE.width * 2}:${SIZE.height * 2}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-movflags', '+faststart', '-an', `${dir}/${name}.mp4`]);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-sseof', '-0.5', '-i', `${dir}/${name}.mp4`, '-frames:v', '1', '-q:v', '3', `${dir}/${name}.jpg`]);
}

test.beforeAll(() => { if (existsSync(TMP)) rmSync(TMP, { recursive: true }); mkdirSync(TMP, { recursive: true }); });
test.afterAll(() => { rmSync(TMP, { recursive: true, force: true }); });

/** Public decks in the stand-in cloud, so the Discover clip has something real-looking to show. */
const PUBLIC_DECKS = (lang: 'en' | 'es') => {
  const es = lang === 'es';
  const deck = (title: string, translation: string, description: string, createdAt: number, verses: [string, string][]) => ({
    ownerId: 'someone', createdAt,
    meta: { title, description, translation, language: lang, cardCount: verses.length },
    cards: Object.fromEntries(verses.map(([reference, verseText], position) => [`${title}-${position}`, { id: `${title}-${position}`, position, reference, verseText }])),
  });
  return {
    a: es
      ? deck('Camino de Romanos', 'RV1909', 'Los versículos clave del camino de Romanos.', 3000, [['Romanos 3:23', 'Por cuanto todos pecaron, y están destituidos de la gloria de Dios.'], ['Romanos 6:23', 'Porque la paga del pecado es muerte, mas la dádiva de Dios es vida eterna en Cristo Jesús Señor nuestro.']])
      : deck('Romans Road', 'WEB', 'The key verses of the Romans Road.', 3000, [['Romans 3:23', 'For all have sinned, and fall short of the glory of God.'], ['Romans 6:23', 'For the wages of sin is death, but the free gift of God is eternal life in Christ Jesus our Lord.']]),
    b: es
      ? deck('Fruto del Espíritu', 'RV1909', 'Gálatas 5:22-23, para memorizar.', 2000, [['Gálatas 5:22', 'Mas el fruto del Espíritu es: amor, gozo, paz, paciencia, benignidad, bondad, fe.']])
      : deck('Fruit of the Spirit', 'KJV', 'Galatians 5:22-23, to memorize.', 2000, [['Galatians 5:22', 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith.']]),
    c: es
      ? deck('Versículos de ánimo', 'RV1909', 'Para los días difíciles.', 1000, [['Josué 1:9', 'Mira que te mando que te esfuerces y seas valiente.']])
      : deck('Verses for hard days', 'BSB', 'Encouragement for the difficult days.', 1000, [['Joshua 1:9', 'Have I not commanded you? Be strong and courageous!']]),
  };
};

for (const lang of ['en', 'es'] as const) {
  const m: Dict = lang === 'es' ? (es as unknown as Dict) : (en as unknown as Dict);
  const T = (k: string) => text(m, k);
  const slow = { delay: 70 };
  const deckTitle = lang === 'es' ? 'Salmo 23' : 'Psalm 23';

  test(`${lang}: decks and cards`, async ({ browser }) => {
    await clip(browser, lang, 'decks-cards', (p) => setupDeck(p, lang, deckTitle), async (p) => {
      await pause(p, 1000);
      // The three dots on the deck, straight from the Decks list: the menu, a moment to read it, then "View cards".
      await p.getByRole('button', { name: new RegExp(deckTitle) }).click();
      await pause(p, 900);
      await p.getByRole('dialog').getByRole('link', { name: T('deckMenu.browse') }).click();
      await pause(p, 1800); // the deck's verse cards
    });
  });

  test(`${lang}: add a verse`, async ({ browser }) => {
    await clip(browser, lang, 'add', (p) => setupDeck(p, lang, deckTitle, 1), async (p) => {
      await pause(p, 700);
      await p.getByRole('button', { name: T('nav.add') }).click();
      await pause(p, 700);
      await p.getByRole('button', { name: T('common.newCard') }).click();
      await pause(p, 900);
      const verse = p.getByLabel(lang === 'es' ? 'Versículo(s)' : 'Verse(s)');
      await verse.click();
      await verse.pressSequentially(lang === 'es' ? 'Juan 3:16' : 'John 3:16', slow);
      await pause(p, 500);
      const passage = p.getByLabel(lang === 'es' ? 'Pasaje' : 'Passage', { exact: true });
      await passage.click();
      await passage.pressSequentially(lang === 'es' ? 'Porque de tal manera amó Dios al mundo...' : 'For God so loved the world...', { delay: 50 });
      await pause(p, 600);
      await p.getByRole('button', { name: T('common.save') }).click();
      await pause(p, 1500);
    });
  });

  test(`${lang}: discover decks`, async ({ browser }) => {
    const decks = PUBLIC_DECKS(lang);
    await clip(
      browser, lang, 'discover',
      async (p) => {
        await p.addInitScript((d) => { if (!localStorage.getItem('sbm-fake-cloud')) localStorage.setItem('sbm-fake-cloud', JSON.stringify({ user: null, decks: d, offline: false })); }, decks);
        await setupDeck(p, lang, deckTitle, 1);
        await p.reload(); // so the stand-in cloud has the public decks
        await p.getByRole('link', { name: new RegExp(deckTitle) }).waitFor();
        await p.waitForTimeout(500);
      },
      async (p) => {
        await pause(p, 700);
        await p.getByRole('button', { name: T('nav.add') }).click();
        await pause(p, 1000);
        // On a small screen the menu is longer than the screen: scroll it so "Discover collections" is seen before it is tapped.
        const discover = p.getByRole('button', { name: T('create.discover') });
        await discover.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'end' }));
        await pause(p, 1500);
        await discover.click();
        await pause(p, 2000);
        await p.locator('a[href*="/discover/"]').first().click();
        await pause(p, 1500);
        const importButton = p.getByRole('button', { name: T('discover.import') });
        await importButton.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'end' }));
        await pause(p, 900);
        await importButton.click();
        await pause(p, 1800);
        await p.getByRole('link', { name: T('common.backToDecks') }).click(); // the imported deck is in the list now
        await pause(p, 2200);
      },
    );
  });

  test(`${lang}: smart scheduling`, async ({ browser }) => {
    let deckId = '';
    await clip(browser, lang, 'schedule', async (p) => { deckId = await setupDeck(p, lang, deckTitle); await p.goto(`/#/collections/${deckId}/study/flashcard`); await p.getByRole('button', { name: T('study.showAnswer') }).waitFor(); await p.waitForTimeout(400); }, async (p) => {
      await pause(p, 700);
      await p.getByRole('button', { name: T('study.showAnswer') }).click();
      await pause(p, 600);
      // A red outline moves over the four ratings, so when each one brings the card back (a minute ... days) can be read.
      await p.addStyleTag({ content: '.clip-highlight { outline: 3px solid #e11d48; outline-offset: 2px; border-radius: 12px; }' });
      const buttons = p.locator('[data-rating-keys] button');
      for (let i = 0; i < 4; i++) {
        await buttons.nth(i).evaluate((el) => el.classList.add('clip-highlight'));
        await pause(p, 900);
        await buttons.nth(i).evaluate((el) => el.classList.remove('clip-highlight'));
      }
    });
  });

  test(`${lang}: the starter deck`, async ({ browser }) => {
    await clip(
      browser, lang, 'starter',
      async (p) => {
        // The real thing: the tour's Skip adds the starter deck (in the language of the phone), and lands on the home screen.
        await p.addInitScript(() => localStorage.setItem('sbm-force-onboarding', '1'));
        await p.goto('/');
        await p.getByRole('button', { name: T('onboarding.skip') }).click();
        await p.getByRole('link', { name: new RegExp(T('starter.title')) }).waitFor();
        await p.waitForTimeout(600);
      },
      async (p) => {
        await pause(p, 1300);
        await p.getByRole('link', { name: new RegExp(T('starter.title')) }).click();
        await pause(p, 2200); // the practice screen, and that is all
      },
    );
  });
}
