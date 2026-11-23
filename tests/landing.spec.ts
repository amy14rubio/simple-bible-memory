import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** The three phone photos beside the letter are kept out of git (they show licensed Bible text), so a fresh clone does not have them. */
const HAS_PHOTOS = existsSync(join(process.cwd(), 'public/landing/note/verse-psalm-73.webp'));

/** The landing page is a plain file (like the privacy policy), with a small script for the text reveal, the phone motion and the flip cards. */
const PAGES = [
  {
    lang: 'English', url: '/landing.html', other: '/es', heading: 'Simple Bible Memory', tagline: 'Learn scripture by heart', open: 'Start Practicing',
    play: 'Get it on Google Play', apple: 'Download on the App Store', donate: 'Support on Ko-fi',
    rates: ['Again', 'Hard', 'Good', 'Easy'], goodWhen: /^10\s?min/, langName: 'English', langOther: 'Español', langOtherHref: '/es', langLabel: 'Language',
    hello: 'A message from the developer', glad: /The idea for this app really came from countless hours of memorizing Bible verses on Anki/, bye: /Thanks for stopping by, and God bless! ❤︎/,
  },
  {
    lang: 'Spanish', url: '/es/landing.html', other: '/', heading: 'Memoria Bíblica Simple', tagline: 'Guarda las Escrituras en tu corazón', open: 'Empezar a practicar',
    play: 'Disponible en Google Play', apple: 'Descargar en el App Store', donate: 'Apoyar en Ko-fi',
    rates: ['Otra vez', 'Difícil', 'Bien', 'Fácil'], goodWhen: /^10\s?min/, langName: 'Español', langOther: 'English', langOtherHref: '/', langLabel: 'Idioma',
    hello: 'Un mensaje de la desarrolladora', glad: /La idea de esta app nació de las incontables horas que pasé memorizando versículos bíblicos en Anki/, bye: /¡Gracias por leer, y que Dios te bendiga! ❤︎/,
  },
] as const;

for (const p of PAGES) {
  test.describe(p.lang, () => {
    test('has the headline, a way into the app and the legal links', async ({ page }) => {
      await page.goto(p.url);
      await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
      await expect(page.locator('.hero .lead')).toHaveText(p.tagline); // the title, and the tagline under it
      await expect(page.getByRole('link', { name: p.open }).first()).toHaveAttribute('href', '/app');
      await expect(page.getByRole('heading', { level: 3 })).toHaveCount(0); // the page has no highlight cards
      await expect(page.locator('footer a[href$="privacy-policy"]')).toHaveCount(1);
      await expect(page.locator('footer a[href$="terms"]')).toHaveCount(1);
      await expect(page.locator(`link[rel="alternate"][href="${p.other}"]`)).toHaveCount(1); // points at the other language
    });

    test('the store buttons are placeholders, and the donation button links to Ko-fi without promising it is free forever', async ({ page }) => {
      await page.goto(p.url);
      const donate = page.getByRole('link', { name: p.donate });
      await expect(donate).toHaveAttribute('href', 'https://ko-fi.com/simplebiblememory');
      await expect(donate).toHaveAttribute('target', '_blank'); // opens in a new tab, so the visitor keeps the page
      await expect(donate).toHaveAttribute('rel', /noopener/);
      await expect(page.locator('body')).not.toContainText(/stays that way|así seguirá|won.t change|no va a cambiar|free forever|gratis para siempre/i);
      const play = page.getByRole('link', { name: p.play });
      await expect(play).toBeVisible();
      await expect(play).toHaveAttribute('href', /play\.google\.com.*app\.simplebiblememory/);
      const store = page.getByRole('link', { name: p.apple });
      await expect(store).toBeVisible();
      await expect(store).toHaveAttribute('href', 'https://apps.apple.com/us/app/simple-bible-memory/id6827304569');
      for (const badge of [play, store]) expect(await badge.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0); // the official badge image loads
    });

    test('the sections come in this order: hero, spaced repetition, features, the note, then support', async ({ page }) => {
      await page.goto(p.url);
      const hello = page.locator('#hello');
      await expect(hello.getByRole('heading', { level: 2, name: p.hello })).toBeVisible();
      await expect(hello).toContainText(p.glad);
      await expect(hello.locator('.signoff')).toHaveText(p.bye);
      await expect(hello.locator('.letter p')).toHaveCount(4);
      const order = await page.locator('main > section:not([hidden])').evaluateAll((els) => els.map((e) => e.id || e.className));
      expect(order).toEqual(['hero', 'spaced', 'simple', 'hello', 'free']);
      await expect(page.locator('#try, #demo')).toHaveCount(0); // there is no demo on the page
    });

    test('spaced repetition shows when a new card comes back: 1 min, 6 min, 10 min, 8 days, for Again, Hard, Good, Easy', async ({ page }) => {
      await page.goto(p.url);
      const chips = page.locator('#spaced .ratings li');
      await expect(chips).toHaveCount(4);
      const names = await chips.locator('.name').allTextContents();
      expect(names).toEqual([...p.rates]);
      const whens = await chips.locator('.when').allTextContents();
      expect(whens[2]).toMatch(p.goodWhen); // Good: ten minutes, the same figure the app shows for a new card
    });

    test('the feature cards turn over on a tap, and turn back on a second tap', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(p.url);
      const cards = page.locator('#simple .flip');
      await expect(cards).toHaveCount(6);
      const first = cards.first();
      await expect(first).toHaveAttribute('aria-pressed', 'false');
      await first.evaluate((el: HTMLElement) => el.click()); // the cards float gently, so a "wait until it holds still" click would never start
      await expect(first).toHaveAttribute('aria-pressed', 'true');
      await first.evaluate((el: HTMLElement) => el.click());
      await expect(first).toHaveAttribute('aria-pressed', 'false');
    });

    test('on a phone the feature cards all have the same height, and nothing spills out of them', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(p.url);
      const sizes = await page.locator('#simple .flip').evaluateAll((els) => els.map((e) => ({ h: Math.round(e.getBoundingClientRect().height), spill: [...e.querySelectorAll('.face')].some((f) => f.scrollHeight > f.clientHeight + 1) })));
      expect(new Set(sizes.map((x) => x.h)).size).toBe(1);
      expect(sizes.some((x) => x.spill)).toBe(false);
    });

    test('the note is a letter: a narrow column, left-aligned, kept tight, the sign-off set apart', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(p.url);
      await page.addStyleTag({ content: '.rv-word { animation: none !important; } .rv-block { opacity: 1 !important; transform: none !important; filter: none !important; transition: none !important; }' });
      const m = await page.evaluate(() => {
        const col = document.querySelector('#hello .letter')!.getBoundingClientRect();
        const para = document.querySelector('#hello .letter p')!;
        const second = document.querySelectorAll('#hello .letter p')[1]!;
        const sign = document.querySelector('#hello .signoff')!.getBoundingClientRect();
        const prev = document.querySelector('#hello .letter p:nth-last-child(2)')!.getBoundingClientRect();
        const signCss = getComputedStyle(document.querySelector('#hello .signoff')!), paraCss = getComputedStyle(para);
        return { sameType: signCss.fontSize === paraCss.fontSize && signCss.fontFamily === paraCss.fontFamily && signCss.fontStyle === paraCss.fontStyle, width: col.width, align: getComputedStyle(para).textAlign, between: second.getBoundingClientRect().top - para.getBoundingClientRect().bottom, gap: sign.top - prev.bottom };
      });
      expect(m.sameType).toBe(true); // the sign-off is not bigger or in another style than the rest of the letter
      expect(m.width).toBeLessThanOrEqual(704); // a line length that stays readable even in the wider (70%) column
      expect(['left', 'start']).toContain(m.align);
      expect(m.between).toBeLessThanOrEqual(16); // paragraphs close together
      expect(m.gap).toBeGreaterThan(m.between); // but the sign-off has more room than they do
    });

    test('without the photos the letter stands alone, centered, with no broken pictures and no empty column', async ({ page }) => {
      await page.route('**/landing/note/*', (route) => route.abort());
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(p.url);
        await page.locator('#hello').scrollIntoViewIfNeeded();
        await expect(page.locator('#hello .pics')).toHaveCount(0); // the pictures and their credit are gone
        await expect(page.locator('#hello .hello-wrap')).toHaveClass(/no-pics/);
        const m = await page.evaluate(() => {
          const l = document.querySelector('#hello .letter')!.getBoundingClientRect();
          return { left: l.left, right: window.innerWidth - l.right, width: l.width, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(Math.abs(m.left - m.right), `${width}px: the letter is centered`).toBeLessThanOrEqual(2);
        expect(m.width).toBeLessThanOrEqual(640);
        expect(m.over).toBe(0);
      }
    });

    test('three pictures with notes sit to the left of the letter on a wide screen and below it on a phone; each has a description, a caption and loads', async ({ page }) => {
      test.skip(!HAS_PHOTOS, 'the phone photos are not in this copy of the repository');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(p.url);
      const imgs = page.locator('#hello .notes img');
      await expect(imgs).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const img = imgs.nth(i);
        await img.scrollIntoViewIfNeeded();
        await expect(img).toHaveAttribute('alt', /.{20,}/);
        await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
        await expect(page.locator('#hello .notes figcaption').nth(i)).not.toBeEmpty();
      }
      await expect(page.locator('#hello .pics .credit')).toContainText(/Lockman/); // the small credit sits right under the pictures
      const under = await page.evaluate(() => ({ notes: document.querySelector('#hello .notes')!.getBoundingClientRect().bottom, credit: document.querySelector('#hello .credit')!.getBoundingClientRect().top, size: parseFloat(getComputedStyle(document.querySelector('#hello .credit')!).fontSize) }));
      expect(under.credit - under.notes).toBeLessThanOrEqual(40);
      expect(under.size).toBeLessThanOrEqual(12);
      const wide = await page.evaluate(() => ({ letterBox: document.querySelector('#hello .hello-text')!.getBoundingClientRect(), letter: document.querySelector('#hello .letter')!.getBoundingClientRect(), notes: document.querySelector('#hello .notes')!.getBoundingClientRect() }));
      expect(wide.letter.left).toBeGreaterThanOrEqual(wide.notes.right); // beside it: the pictures on the left, the letter on the right
      expect(wide.letterBox.width / (wide.letterBox.width + wide.notes.width)).toBeGreaterThanOrEqual(0.52); // the letter has the larger share (55% of the row, minus the gap)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(200);
      const narrow = await page.evaluate(() => ({ letter: document.querySelector('#hello .letter')!.getBoundingClientRect(), notes: document.querySelector('#hello .notes')!.getBoundingClientRect(), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
      expect(narrow.notes.top).toBeGreaterThanOrEqual(narrow.letter.bottom); // below it
      expect(narrow.over).toBe(0);
    });

    test('the first screen is only the hero: nothing of the note (title, pictures or text) is in sight until you scroll', async ({ page }) => {
      for (const [width, height] of [[1288, 724], [1440, 900], [390, 844]] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(p.url);
        const top = await page.evaluate(() => document.querySelector('#hello')!.getBoundingClientRect().top);
        expect(top, `${width}x${height}: the note starts below the screen`).toBeGreaterThanOrEqual(height);
        const h2 = await page.evaluate(() => document.querySelector('#hello h2')!.getBoundingClientRect().top);
        expect(h2, `${width}x${height}: and so does its title`).toBeGreaterThanOrEqual(height);
      }
    });

    test('the app has one name on the page, in the page\'s language: the top bar, the donation line and the footer all use it', async ({ page }) => {
      await page.goto(p.url);
      await expect(page.locator('header .brand')).toContainText(p.heading);
      await expect(page.locator('footer .brand')).toContainText(p.heading);
      await expect(page.locator('.free p')).toContainText(p.heading);
      if (p.lang === 'Spanish') await expect(page.locator('body')).not.toContainText('Simple Bible Memory'); // no English name left on the Spanish page
    });

    test('the footer has the logo, columns of links, and a language picker that opens upwards', async ({ page }) => {
      await page.goto(p.url);
      const footer = page.locator('footer');
      await expect(footer.locator('img[src="/logo.svg"]')).toBeVisible();
      await expect(footer.getByRole('link', { name: p.heading })).toBeVisible(); // the app's name in this language
      const summary = footer.locator('summary');
      await expect(summary).toContainText(p.langName);
      const menu = footer.getByRole('list', { name: p.langLabel });
      await expect(menu).toBeHidden();
      await summary.click();
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('link', { name: p.langName })).toHaveAttribute('aria-current', 'true'); // the current language has the check mark
      await expect(menu.getByRole('link', { name: p.langOther })).toHaveAttribute('href', p.langOtherHref);
      const [m, sBox] = [await menu.boundingBox(), await summary.boundingBox()];
      expect(m!.y + m!.height).toBeLessThanOrEqual(sBox!.y); // it opens upwards (a drop-up)
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
      await expect(summary).toBeFocused();
      await summary.click();
      await page.locator('h1').click(); // a click elsewhere closes it too
      await expect(menu).toBeHidden();
    });

    test('works without scripts too: the footer language links are still there', async ({ browser }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false });
      const page = await ctx.newPage();
      await page.goto(p.url);
      await page.locator('footer summary').click(); // <details> opens with no script
      await expect(page.getByRole('list', { name: p.langLabel }).getByRole('link', { name: p.langOther })).toBeVisible();
      await ctx.close();
    });

    test('fits a phone without sideways scrolling', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(p.url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });

    test('the footer has room at the sides', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(p.url);
      expect(await page.locator('footer .foot-col a').first().evaluate((a) => a.getBoundingClientRect().left)).toBeGreaterThanOrEqual(28); // not hugging the edge
    });

    test('the logo looks centered on the name, in the top bar and in the footer (measured on the pixels)', async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, colorScheme: 'light', deviceScaleFactor: 3 });
      const page = await ctx.newPage();
      await page.goto(p.url);
      await page.addStyleTag({ content: '.rv-word { animation: none !important; } .rv-block { opacity: 1 !important; transform: none !important; filter: none !important; transition: none !important; }' }); // measure the finished footer, not one still fading in
      await page.evaluate(() => document.fonts.ready);
      for (const sel of ['header .brand', 'footer .brand']) {
        const png = (await page.locator(sel).screenshot()).toString('base64');
        // Looks at the picture itself: the middle of the logo's ink against the middle of the first capital letter's ink.
        const off = await page.evaluate(async (b64) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data, w = c.width, h = c.height;
          const ink = (x: number, y: number) => { const i = (y * w + x) * 4; return Math.abs(d[i]! - d[0]!) + Math.abs(d[i + 1]! - d[1]!) + Math.abs(d[i + 2]! - d[2]!) > 90; };
          const cols: boolean[] = []; for (let x = 0; x < w; x++) { let any = false; for (let y = 0; y < h && !any; y++) any = ink(x, y); cols.push(any); }
          const runs: [number, number][] = []; for (let x = 0; x < w;) { if (cols[x]) { const s = x; while (x < w && cols[x]) x++; runs.push([s, x]); } else x++; }
          let at = 1, best = 0; for (let i = 1; i < runs.length; i++) { const gap = runs[i]![0] - runs[i - 1]![1]; if (gap > best) { best = gap; at = i; } }
          const rows = (a: number, b: number) => { let lo = h, hi = 0; for (let y = 0; y < h; y++) for (let x = a; x < b; x++) if (ink(x, y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); } return (lo + hi) / 2; };
          return (rows(runs[at]![0], runs[at]![1]) - rows(runs[0]![0], runs[at - 1]![1])) / 3; // css pixels
        }, png);
        expect(Math.abs(off), sel).toBeLessThanOrEqual(0.7); // text snaps to whole pixels, so a logo can land up to a pixel either way depending on the page height
      }
      await ctx.close();
    });

    test('on a phone the footer is one column, and the email address fits on one line', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(p.url);
      const columns = await page.locator('footer .foot-col').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
      expect(new Set(columns).size).toBe(1); // stacked: they all start at the same left edge
      const email = (await page.locator('footer a[href^="mailto:"]').boundingBox())!;
      expect(email.height).toBeLessThan(32); // one line, not wrapped
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`has no WCAG A/AA violations (${scheme})`, async ({ browser }) => {
        const ctx = await browser.newContext({ colorScheme: scheme });
        const page = await ctx.newPage();
        await page.goto(p.url);
        await page.addStyleTag({ content: '.rv-word { animation: none !important; } .rv-block { opacity: 1 !important; transform: none !important; filter: none !important; transition: none !important; }' }); // check the finished page, not something caught halfway through its reveal
        await page.locator('#simple .flip').first().evaluate((el: HTMLElement) => el.click()); // and a card turned over
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations).toEqual([]);
        await ctx.close();
      });
    }
  });
}

test('loading the page leaves the focus alone: nothing moves it until the visitor does', async ({ page }) => {
  await page.goto('/landing.html');
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
});

test('the moving light behind the hero is decoration only: hidden from screen readers, never in the way of clicks', async ({ page }) => {
  await page.goto('/landing.html');
  const prism = page.locator('.hero .prism');
  await expect(prism).toHaveAttribute('aria-hidden', 'true');
  expect(await prism.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.getByRole('link', { name: 'Start Practicing' }).last().click();
  await expect(page).toHaveURL(/\/app$|#\//);
});

for (const path of ['/privacy-policy.html', '/terms.html', '/delete-account.html', '/es/privacy-policy.html', '/es/terms.html', '/es/delete-account.html']) {
  test(`${path}: on a wide screen the text column is 48rem wide and lines up with the header`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const box = await page.evaluate(() => {
      const m = document.querySelector('main')!.getBoundingClientRect();
      const h = document.querySelector('header')!.getBoundingClientRect();
      return { main: m.width, mainLeft: m.left, headerLeft: h.left };
    });
    expect(box.main).toBe(768);
    expect(box.headerLeft).toBe(box.mainLeft);
  });
}

for (const [lang, path, title] of [['English', '/landing.html', 'Simple Bible Memory'], ['Spanish', '/es/landing.html', 'Memoria Bíblica Simple']] as const) {
  test.describe(`${lang}: text reveal`, () => {
    test('the hero words blur in, and then every word is fully visible and the sentence is unchanged', async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.hero h1 .rv-word').first()).toBeAttached();
      await expect(page.locator('.hero h1')).toHaveText(title);
      await page.waitForTimeout(2200);
      const opacities = await page.locator('.hero .rv-word').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
      expect(opacities.length).toBeGreaterThan(3);
      expect(opacities.every((o) => o === '1')).toBe(true);
      expect(await page.evaluate(() => document.documentElement.classList.contains('reveal-pending'))).toBe(false);
    });

    test('a section heading plays only once it scrolls into view', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      const feat = page.locator('#simple h2');
      await expect(feat).not.toHaveClass(/rv-go/);
      await feat.scrollIntoViewIfNeeded();
      await expect(feat).toHaveClass(/rv-go/);
    });

    test('the feature cards and the footer start hidden and fade in once scrolled into view', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      const card = page.locator('#simple .flips li').last();
      await expect(card).not.toHaveClass(/rv-go/);
      expect(await card.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveAttribute('data-revealed', ''); // it has finished appearing and is back to its normal styles
      expect(await card.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      const foot = page.locator('footer .foot-brand');
      await foot.scrollIntoViewIfNeeded();
      await expect(foot).toHaveAttribute('data-revealed', '');
    });

    test('the paragraphs of the note come in one after another, once the letter is in view', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 700 });
      await page.goto(path);
      const paras = page.locator('#hello .letter p');
      await expect(paras).toHaveCount(4);
      expect(await paras.evaluateAll((els) => els.map((e) => (e as HTMLElement).style.getPropertyValue('--d')))).toEqual(['0ms', '110ms', '220ms', '330ms']); // staggered
      await expect.poll(() => paras.last().evaluate((el) => getComputedStyle(el).opacity)).toBe('0'); // the script hides them with a short fade; wait until that has finished
      const before = await paras.evaluateAll((els) => els.map((e) => ({ go: e.classList.contains('rv-go'), opacity: getComputedStyle(e).opacity }))); // one read, so the class and the opacity are from the same moment
      expect(before.map((b) => b.go)).toEqual([false, false, false, false]); // not shown while the note is below the screen
      expect(before.map((b) => b.opacity)).toEqual(['0', '0', '0', '0']);
      await page.locator('#hello .letter').scrollIntoViewIfNeeded();
      for (let i = 0; i < 4; i++) await expect(paras.nth(i)).toHaveAttribute('data-revealed', '', { timeout: 4000 }); // all of them end up shown, back to their normal styles
      expect(await paras.last().evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    });

    test('the hero buttons are quick to appear and, once there, react to hover with no reveal delay', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      const start = page.locator('.hero .stores .badge').first();
      await expect(start).toHaveAttribute('data-revealed', '', { timeout: 4000 }); // both badges within about a second
      await expect(page.locator('.hero .stores .badge').last()).toHaveAttribute('data-revealed', '', { timeout: 4000 });
      const before = await start.evaluate((el) => getComputedStyle(el).transitionDelay);
      expect(before).toBe('0s'); // nothing left over from the reveal
      await start.hover();
      await expect(start).toBeVisible(); // (it leads to the store, so it is not clicked here)
    });

    test('with reduced motion the text is plain: no split words, nothing hidden', async ({ browser }) => {
      const ctx = await browser.newContext({ reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(path);
      await expect(page.locator('.hero h1')).toBeVisible();
      await expect(page.locator('.rv-word')).toHaveCount(0);
      expect(await page.locator('#hello .letter').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await ctx.close();
    });
  });
}
