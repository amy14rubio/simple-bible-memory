import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The landing page is a plain file (like the privacy policy), with a small script for the demo. */
const PAGES = [
  {
    lang: 'English', url: '/landing.html', other: '/es', heading: 'Simple Bible Memory', tagline: 'Learn scripture by heart', open: 'Start Practicing',
    play: 'Get it on Google Play', apple: 'Download on the App Store', donate: 'Support on Ko-fi',
    features: ['No account needed', 'English and Spanish', 'Spaced repetition', 'Make it yours'],
    show: 'Show answer', rates: ['Again', 'Hard', 'Good', 'Easy'], goodWhen: /10m/, next: 'Try another verse', first: 'Proverbs 3:5-6', second: 'Romans 5:8',
    typeTab: 'Type', speakTab: 'Speak', blanksTab: 'Fill in the blanks', typeFull: 'For God didn’t give us a spirit of fear, but of power, love, and self-control.', typePartial: 'For God give us a spirit of fear', typeAll: /You remembered 15 of 15 words/, typeSome: /You remembered 8 of 15 words/, check: 'Show answer', speakText: 'Recite verses hands-free while you drive or go about your day. The app reads them back, and you rate yourself for easy, relaxed practice.', langName: 'English', langOther: 'Español', langOtherHref: '/es', langLabel: 'Language', words: ['fear', 'power', 'self-control'], done: /That’s it!/, wrongWord: 'love', wrongNote: /Not quite: the word was “fear”/,
  },
  {
    lang: 'Spanish', url: '/es/landing.html', other: '/', heading: 'Memoria Bíblica Simple', tagline: 'Guarda las Escrituras en tu corazón', open: 'Empezar a practicar',
    play: 'Disponible en Google Play', apple: 'Descargar en el App Store', donate: 'Apoyar en Ko-fi',
    features: ['Sin cuenta', 'Español e inglés', 'Repaso espaciado', 'A tu manera'],
    show: 'Mostrar respuesta', rates: ['Otra vez', 'Difícil', 'Bien', 'Fácil'], goodWhen: /10 min/, next: 'Probar otro versículo', first: 'Proverbios 3:5-6', second: 'Romanos 5:8',
    typeTab: 'Escribir', speakTab: 'Hablar', blanksTab: 'Completar espacios', typeFull: 'Porque no nos ha dado Dios el espíritu de temor, sino el de fortaleza, y de amor, y de templanza.', typePartial: 'Porque no nos ha dado Dios el espiritu de temor', typeAll: /Recordaste 20 de 20 palabras/, typeSome: /Recordaste 10 de 20 palabras/, check: 'Mostrar respuesta', speakText: 'Recita versículos sin manos mientras manejas o sigues con tu día. La app te los lee de vuelta, y tú te calificas para una práctica fácil y tranquila.', langName: 'Español', langOther: 'English', langOtherHref: '/', langLabel: 'Idioma', words: ['temor', 'fortaleza', 'templanza'], done: /¡Eso es!/, wrongWord: 'amor', wrongNote: /Casi: la palabra era “temor”/,
  },
] as const;

for (const p of PAGES) {
  test.describe(p.lang, () => {
    test('has the headline, a way into the app, the four highlights and the legal links', async ({ page }) => {
      await page.goto(p.url);
      await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible();
      await expect(page.locator('.hero .lead')).toHaveText(p.tagline); // the title, and the tagline under it
      await expect(page.getByRole('link', { name: p.open }).first()).toHaveAttribute('href', '/app');
      for (const f of p.features) await expect(page.getByRole('heading', { level: 3, name: f })).toBeVisible();
      await expect(page.getByRole('heading', { level: 3 })).toHaveCount(4); // four short highlights; "free" has its own section below
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

    test('the demo: flip a flashcard, rate it, see when it comes back, try another verse', async ({ page }) => {
      await page.goto(p.url);
      await expect(page.locator('#demo').getByText(p.first, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: p.show }).click();
      for (const r of p.rates) await expect(page.getByRole('button', { name: new RegExp(`^${r}, `) })).toBeVisible();
      await page.getByRole('button', { name: new RegExp(`^${p.rates[2]}, `) }).click();
      await expect(page.locator('.d-msg')).toContainText(p.goodWhen);
      await page.getByRole('button', { name: p.next }).click();
      await expect(page.locator('#demo').getByText(p.second, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: p.show })).toBeVisible(); // back at the front of the next card
    });

    test('the demo: fill in the blanks, a right word fills in, a wrong word shows the right one in red, and it finishes', async ({ page }) => {
      await page.goto(p.url);
      await page.getByRole('button', { name: p.blanksTab }).click();
      const bank = page.getByRole('group').filter({ has: page.getByRole('button', { name: p.wrongWord, exact: true }) });
      await bank.getByRole('button', { name: p.wrongWord, exact: true }).click(); // wrong for the first blank
      await expect(page.locator('.d-verse .wrong')).toHaveText(p.words[0]); // the right word, in red
      await expect(page.getByRole('status')).toContainText(p.wrongNote);
      await bank.getByRole('button', { name: p.words[1], exact: true }).click();
      await bank.getByRole('button', { name: p.words[2], exact: true }).click();
      await expect(page.locator('.d-msg')).toContainText(p.done);
      await expect(page.getByRole('button', { name: p.next })).toHaveCount(0); // only the flashcard offers another verse
    });

    test('the demo: type the verse, see how much was remembered, and only try the same verse again', async ({ page }) => {
      await page.goto(p.url);
      await page.getByRole('button', { name: p.typeTab, exact: true }).click();
      await page.getByRole('textbox').fill(p.typePartial);
      await page.getByRole('button', { name: p.check }).click();
      await expect(page.getByRole('status')).toHaveText(p.typeSome);
      await expect(page.locator('.d-results .miss').first()).toBeVisible(); // the missed words, in red
      await expect(page.locator('.d-results .ok').first()).toBeVisible(); // the right ones, in green
      await expect(page.getByRole('button', { name: p.next })).toHaveCount(0); // only the flashcard offers another verse
      await page.getByRole('button', { name: new RegExp(`^${p.rates[2]}, `) }).click(); // rate it, as in the app
      await expect(page.locator('.d-msg')).toContainText(p.goodWhen);
      await page.getByRole('button', { name: /^(Try again|Probar otra vez)$/ }).click();
      await page.getByRole('textbox').fill(p.typeFull);
      await page.getByRole('button', { name: p.check }).click();
      await expect(page.getByRole('status')).toHaveText(p.typeAll);
      await expect(page.locator('.d-results .miss')).toHaveCount(0); // nothing missed
    });

    test('the Speak tab explains hands-free practice in one positive sentence, with nothing to press', async ({ page }) => {
      await page.goto(p.url);
      await page.getByRole('button', { name: p.speakTab, exact: true }).click();
      await expect(page.locator('#demo .d-explain')).toHaveText(p.speakText); // hands-free practice, and you rate yourself
      await expect(page.locator('#demo .d-bar')).toBeHidden(); // an explanation, not a demo: no buttons
      await expect(page.getByRole('button', { name: p.next })).toHaveCount(0);
    });

    test('the footer has the logo, columns of links, and a language picker that opens upwards', async ({ page }) => {
      await page.goto(p.url);
      const footer = page.locator('footer');
      await expect(footer.locator('img[src="/logo.svg"]')).toBeVisible();
      await expect(footer.getByRole('link', { name: 'Simple Bible Memory' })).toBeVisible();
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

    test('fits a phone without sideways scrolling (only the screenshots strip scrolls, inside itself)', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(p.url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });

    test('the highlight icons are the text color: black in light mode, white in dark mode', async ({ browser }) => {
      for (const [scheme, color] of [['light', 'rgb(23, 23, 26)'], ['dark', 'rgb(241, 240, 236)']] as const) {
        const ctx = await browser.newContext({ colorScheme: scheme });
        const page = await ctx.newPage();
        await page.goto(p.url);
        const icons = page.locator('.grid .icon');
        await expect(icons).toHaveCount(4);
        for (let i = 0; i < 4; i++) await expect(icons.nth(i)).toHaveCSS('color', color);
        await ctx.close();
      }
    });

    test('the highlight icons are bigger and centered beside their text', async ({ page }) => {
      await page.goto(p.url);
      const cards = page.locator('.grid li');
      for (let i = 0; i < 4; i++) {
        const m = await cards.nth(i).evaluate((li) => {
          const icon = li.querySelector('.icon')!.getBoundingClientRect(), text = li.querySelector('div')!.getBoundingClientRect();
          return { size: icon.width, iconMid: icon.top + icon.height / 2, textMid: text.top + text.height / 2 };
        });
        expect(m.size).toBeGreaterThanOrEqual(36); // bigger than before (24)
        expect(Math.abs(m.iconMid - m.textMid)).toBeLessThanOrEqual(2); // centered on the text beside it
      }
    });

    test('on a phone each screenshot can be centered: the first and the last snap to the middle', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(p.url);
      const mid = () => page.locator('.shots .phone').evaluateAll((els, vw) => els.map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2 - vw / 2); }), 390);
      const start = await mid();
      expect(Math.abs(start[0]!)).toBeLessThanOrEqual(2); // the first one is in the middle
      await page.locator('.shots').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      await expect.poll(async () => Math.abs((await mid())[2]!)).toBeLessThanOrEqual(2); // and so is the last
    });

    test('on a wide screen the three screenshots sit in the middle of the page', async ({ page }) => {
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.goto(p.url);
      const [first, last] = await page.locator('.shots .phone').evaluateAll((els) => [els[0]!, els[els.length - 1]!].map((e) => e.getBoundingClientRect()));
      expect(Math.abs(first!.left - (1200 - last!.right))).toBeLessThanOrEqual(2); // the same space on both sides
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

    test('the screenshots have room under their heading, and no scrollbar under them', async ({ page }) => {
      for (const width of [390, 1100]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(p.url);
        const gap = await page.evaluate(() => document.querySelector('.shots .phone')!.getBoundingClientRect().top - document.querySelector('.screens h2')!.getBoundingClientRect().bottom);
        expect(gap).toBeGreaterThanOrEqual(48); // about 3.5rem
        const bar = await page.locator('.shots').evaluate((el) => ({ height: el.offsetHeight - el.clientHeight, width: getComputedStyle(el).scrollbarWidth }));
        expect(bar.width).toBe('none');
        expect(bar.height).toBe(0); // nothing is drawn under the screenshots
      }
    });

    test('shows real screenshots, each with a description', async ({ page }) => {
      await page.goto(p.url);
      const shots = page.locator('.shots img');
      await expect(shots).toHaveCount(3);
      for (let i = 0; i < 3; i++) {
        const img = shots.nth(i);
        await img.scrollIntoViewIfNeeded();
        await expect(img).toHaveAttribute('alt', /.{20,}/); // a real description, not a file name
        await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
      }
    });

    for (const scheme of ['light', 'dark'] as const) {
      test(`has no WCAG A/AA violations (${scheme})`, async ({ browser }) => {
        const ctx = await browser.newContext({ colorScheme: scheme });
        const page = await ctx.newPage();
        await page.goto(p.url);
        await page.addStyleTag({ content: '.rv-word { animation: none !important; } .rv-block { opacity: 1 !important; transform: none !important; filter: none !important; transition: none !important; }' }); // check the finished page, not something caught halfway through its reveal
        await page.getByRole('button', { name: p.show }).click(); // the demo in its other state too
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(results.violations).toEqual([]);
        await ctx.close();
      });
    }
  });
}

test('the demo does nothing until the visitor does: loading the page leaves the focus alone', async ({ page }) => {
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

test('on a wide screen the four highlight cards line up with the three phone screenshots', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/landing.html');
  const edges = await page.evaluate(() => {
    const phones = [...document.querySelectorAll('.shots .phone')].map((e) => e.getBoundingClientRect());
    const grid = document.querySelector('.grid')!.getBoundingClientRect();
    return { phones: [phones[0].left, phones[phones.length - 1].right], grid: [grid.left, grid.right] };
  });
  expect(Math.abs(edges.grid[0] - edges.phones[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(edges.grid[1] - edges.phones[1])).toBeLessThanOrEqual(1);
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
      const feat = page.locator('#features h2');
      await expect(feat).not.toHaveClass(/rv-go/);
      await feat.scrollIntoViewIfNeeded();
      await expect(feat).toHaveClass(/rv-go/);
    });

    test('cards, screenshots, the demo and the footer start hidden and fade in once scrolled into view', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      const card = page.locator('.grid li').first();
      await expect(card).not.toHaveClass(/rv-go/);
      expect(await card.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
      await card.scrollIntoViewIfNeeded();
      await expect(card).toHaveAttribute('data-revealed', ''); // it has finished appearing and is back to its normal styles
      expect(await card.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      const foot = page.locator('footer .foot-brand');
      await foot.scrollIntoViewIfNeeded();
      await expect(foot).toHaveAttribute('data-revealed', '');
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
      expect(await page.locator('.grid li').first().evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await ctx.close();
    });
  });
}
