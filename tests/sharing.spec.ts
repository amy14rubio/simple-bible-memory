import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { addCard, closeWithEscape, createDeck, openDeck } from './helpers';

/** The browser tests use stand-ins for Google sign-in and the public catalogue (kept in localStorage; see fakeBackend.ts). */
interface FakeCloud { user: { uid: string } | null; decks: Record<string, { meta: { title: string; cardCount: number; translation: string; language: string; description: string | null }; cards: Record<string, { reference: string; verseText: string; position: number }> }>; offline: boolean }
const cloud = (page: Page) => page.evaluate(() => (window as unknown as { __fakeCloud: () => FakeCloud }).__fakeCloud());
const setFake = (page: Page, patch: Partial<FakeCloud>) => page.evaluate((p) => { const s = JSON.parse(localStorage.getItem('sbm-fake-cloud') ?? '{}'); localStorage.setItem('sbm-fake-cloud', JSON.stringify({ ...s, ...p })); }, patch);
const published = async (page: Page) => Object.values((await cloud(page)).decks);

const picker = (page: Page, label: string) => page.getByRole('button', { name: new RegExp(`^${label}:`) });
const drawer = (page: Page) => page.getByRole('dialog', { name: /^(Publish deck|Published deck)$/ });

async function setTranslation(page: Page, deckId: string, option: string) {
  await page.goto(`/#/decks/${deckId}/edit`);
  await picker(page, 'Translation').click();
  await page.getByRole('dialog', { name: 'Select a translation' }).getByRole('button', { name: option }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(new RegExp(`#/decks/${deckId}$`));
}

async function psalmsDeck(page: Page, translation: string | null = 'King James Version (KJV)') {
  const id = await createDeck(page, 'Psalm 23');
  await addCard(page, id, 'Psalm 23:1', 'The Lord is my shepherd; I shall not want.');
  await addCard(page, id, 'Psalm 23:2', 'He maketh me to lie down in green pastures.');
  if (translation) await setTranslation(page, id, translation);
  return id;
}

async function openPublish(page: Page, deckId: string) {
  await openDeck(page, deckId);
  await page.getByRole('button', { name: 'Deck actions' }).click();
  await page.getByRole('button', { name: /^(Publish deck|Unpublish deck)$/ }).click();
  await expect(drawer(page)).toBeVisible();
}

const rulesDrawer = (page: Page) => page.getByRole('dialog', { name: 'Community rules' });
/** Presses Publish. The first time, the separate community-rules drawer opens, and "Agree and publish" finishes the job. */
const publish = async (page: Page) => {
  await drawer(page).getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(rulesDrawer(page).or(page.getByText('Deck published'))).toBeVisible();
  if (await rulesDrawer(page).isVisible()) await rulesDrawer(page).getByRole('button', { name: 'Agree and publish' }).click();
};
const signInInDrawer = async (page: Page) => { await drawer(page).getByRole('button', { name: 'Continue with Google' }).click(); await expect(drawer(page).getByRole('button', { name: 'Publish', exact: true })).toBeVisible(); };

test.describe('a card\'s note stays private', () => {
  test('the note field explains itself behind an "i", and a published deck never contains notes', async ({ page }) => {
    const id = await createDeck(page, 'Psalm 23');
    await page.goto(`/#/cards/new?deck=${id}`);
    await expect(page.getByLabel('Source')).toHaveCount(0); // it used to be called Source
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Note' })).toContainText('It stays private and is never published with a deck');
    await closeWithEscape(page);
    await expect(page.getByRole('dialog')).toHaveCount(0); // wait for the drawer to finish closing
    await page.getByLabel('Verse(s)').fill('Psalm 23:1');
    await page.getByRole('textbox', { name: 'Note' }).fill('from the AMP, memorize by Friday');
    await page.getByLabel('Passage', { exact: true }).fill('The Lord is my shepherd; I shall not want.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Psalm 23:1 added')).toBeVisible();
    await page.waitForTimeout(300);
    await setTranslation(page, id, 'King James Version (KJV)');

    await openPublish(page, id);
    await signInInDrawer(page);
    await publish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    const [deck] = await published(page);
    expect(Object.values(deck!.cards)).toHaveLength(1);
    expect(JSON.stringify(deck)).not.toMatch(/AMP|Friday|note/); // the private note never leaves the phone
  });
});

test.describe('a deck\'s translation', () => {
  test('is chosen on the deck form, remembered, and "my own words" asks for a language', async ({ page }) => {
    const id = await createDeck(page, 'Verses');
    await page.goto(`/#/decks/${id}/edit`);
    await expect(picker(page, 'Translation')).toContainText('Not set');
    await expect(page.getByRole('button', { name: /^Language:/ })).toHaveCount(0);
    await picker(page, 'Translation').click();
    const list = page.getByRole('dialog', { name: 'Select a translation' });
    for (const name of ['King James Version (KJV)', 'World English Bible (WEB)', 'American Standard Version (ASV)', "Young's Literal Translation (YLT)", 'Darby Translation (DARBY)', 'Reina-Valera 1909 (RV1909)', 'My own words']) await expect(list.getByRole('button', { name })).toBeVisible();
    await list.getByRole('button', { name: 'My own words' }).click();
    await expect(page.getByRole('button', { name: /^Language:/ })).toBeVisible();
    await page.getByRole('button', { name: /^Language:/ }).click();
    await page.getByRole('dialog', { name: 'Language' }).getByRole('button', { name: 'Español' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(new RegExp(`#/decks/${id}$`));

    await page.goto(`/#/decks/${id}/edit`);
    await expect(picker(page, 'Translation')).toContainText('My own words');
    await expect(page.getByRole('button', { name: /^Language:/ })).toContainText('Español');
  });
});

test.describe('publishing', () => {
  test('sign in, then publish: the public copy has the deck and every card, and no author name', async ({ page }) => {
    const id = await psalmsDeck(page);
    await openPublish(page, id);
    await expect(drawer(page).getByText('Sign in with Google to publish')).toBeVisible();
    await expect(drawer(page).getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0); // not until signed in
    await signInInDrawer(page);
    await publish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    await expect(drawer(page)).toHaveCount(0);

    const [deck] = await published(page);
    expect(deck!.meta).toMatchObject({ title: 'Psalm 23', translation: 'KJV', language: 'en', cardCount: 2 });
    expect(Object.values(deck!.cards).map((c) => [c.position, c.reference])).toEqual([[0, 'Psalm 23:1'], [1, 'Psalm 23:2']]);
    expect(JSON.stringify(deck)).not.toMatch(/Reader|reader@example\.com/); // nothing about the person
  });

  test('a deck with no translation, or a copyrighted one, cannot be published, and says why', async ({ page }) => {
    const id = await psalmsDeck(page, null);
    await openPublish(page, id);
    await signInInDrawer(page);
    await expect(drawer(page).getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await expect(drawer(page)).toContainText("Choose the translation of this deck's text to publish it.");

    await closeWithEscape(page);
    await setTranslation(page, id, "Another translation (can't be published)");
    await openPublish(page, id);
    await expect(drawer(page).getByRole('button', { name: 'Publish', exact: true })).toBeDisabled();
    await expect(drawer(page)).toContainText("This translation is copyrighted, so it can't be published.");
    expect(await published(page)).toHaveLength(0);
  });

  test('you can pick the translation right in the drawer, and then publish', async ({ page }) => {
    const id = await psalmsDeck(page, null);
    await openPublish(page, id);
    await signInInDrawer(page);
    await picker(page, 'Translation').click();
    await page.getByRole('dialog', { name: 'Select a translation' }).getByRole('button', { name: 'World English Bible (WEB)' }).click();
    await expect(drawer(page).getByRole('button', { name: 'Publish', exact: true })).toBeEnabled();
    await publish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    expect((await published(page))[0]!.meta.translation).toBe('WEB');
  });

  test('"Why only some translations?" explains the copyright rule in plain words', async ({ page }) => {
    const id = await psalmsDeck(page);
    await openPublish(page, id);
    await signInInDrawer(page);
    await drawer(page).getByRole('button', { name: 'Why only some translations?' }).click();
    const why = page.getByRole('dialog', { name: 'Why only some translations?' });
    await expect(why).toContainText('copyrighted');
    await expect(why).toContainText('taken down');
    await expect(why).toContainText('free to share');
    await expect(why).toContainText('export any deck to a file');
  });

  test('the deck menu says Unpublish deck afterwards, with the status and an Unpublish button', async ({ page }) => {
    const id = await psalmsDeck(page);
    await openPublish(page, id);
    await signInInDrawer(page);
    await publish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    await page.waitForTimeout(300);

    await openPublish(page, id); // (the menu item now says "Unpublish deck"; it opens the drawer)
    await expect(drawer(page)).toContainText('Published. Changes you make are sent automatically.');
    await drawer(page).getByRole('button', { name: 'Unpublish' }).click();
    await expect(page.getByText('Deck unpublished')).toBeVisible();
    expect(await published(page)).toHaveLength(0);
    await page.waitForTimeout(300);
    await openDeck(page, id);
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await expect(page.getByRole('button', { name: 'Publish deck' })).toBeVisible(); // back to unpublished; the local deck is untouched
    await expect(page.getByRole('button', { name: 'Unpublish deck' })).toHaveCount(0);
  });
});

test.describe('automatic syncing of a published deck', () => {
  async function publishedDeck(page: Page) {
    const id = await psalmsDeck(page);
    await openPublish(page, id);
    await signInInDrawer(page);
    await publish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    await page.waitForTimeout(300); // the drawer's history clean-up, before the page is reloaded
    await page.reload(); // clears the toast
    return id;
  }

  test('adding, changing and deleting cards, and renaming the deck, reach the public copy by themselves', async ({ page }) => {
    const id = await publishedDeck(page);
    await addCard(page, id, 'Psalm 23:3', 'He restoreth my soul.');
    await expect.poll(async () => Object.keys((await published(page))[0]!.cards).length, { timeout: 15_000 }).toBe(3);
    expect((await published(page))[0]!.meta.cardCount).toBe(3);

    await page.goto(`/#/decks/${id}/edit`);
    await page.getByLabel('Title').fill('Psalm 23 (renamed)');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await published(page))[0]!.meta.title, { timeout: 15_000 }).toBe('Psalm 23 (renamed)');

    await page.goto(`/#/decks/${id}/cards`);
    await page.getByRole('link', { name: 'Psalm 23:1' }).click();
    await page.getByLabel('Passage', { exact: true }).fill('The Lord is my shepherd.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => Object.values((await published(page))[0]!.cards).some((c) => c.verseText === 'The Lord is my shepherd.'), { timeout: 15_000 }).toBe(true);

    await page.goto(`/#/decks/${id}/cards`);
    await page.getByRole('link', { name: 'Psalm 23:2' }).click();
    await page.getByRole('button', { name: 'Delete card' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete card' }).click();
    await expect.poll(async () => Object.keys((await published(page))[0]!.cards).length, { timeout: 15_000 }).toBe(2);
  });

  test('deleting a published deck warns that it is also unpublished, then removes its public copy', async ({ page }) => {
    const id = await publishedDeck(page);
    await openDeck(page, id);
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('button', { name: 'Delete deck' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('This deck is published. Deleting it also removes it from Discover')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Delete deck' })).toHaveCount(0); // the button says what it does instead
    await dialog.getByRole('button', { name: 'Delete and unpublish' }).click();
    await expect.poll(async () => (await published(page)).length, { timeout: 15_000 }).toBe(0);
  });

  test('deleting a deck that is not published has no unpublish warning', async ({ page }) => {
    const id = await createDeck(page, 'Private deck');
    await openDeck(page, id);
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await page.getByRole('button', { name: 'Delete deck' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('permanently deleted')).toBeVisible();
    await expect(dialog.getByText(/is published/)).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Delete deck' })).toBeVisible();
  });

  test('edits made while offline are sent when the connection is back', async ({ page }) => {
    const id = await publishedDeck(page);
    await setFake(page, { offline: true });
    await addCard(page, id, 'Psalm 23:4', 'Yea, though I walk through the valley.');
    await page.waitForTimeout(2500);
    expect(Object.keys((await published(page))[0]!.cards)).toHaveLength(2); // not sent yet
    await openPublish(page, id);
    await expect(drawer(page)).toContainText('Waiting for a connection');
    await closeWithEscape(page);

    await setFake(page, { offline: false });
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(async () => Object.keys((await published(page))[0]!.cards).length, { timeout: 15_000 }).toBe(3);
  });

  test('signed out, edits wait; signing in again catches up', async ({ page }) => {
    const id = await publishedDeck(page);
    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    await addCard(page, id, 'Psalm 23:5', 'Thou preparest a table.');
    await page.waitForTimeout(2500);
    expect(Object.keys((await published(page))[0]!.cards)).toHaveLength(2);
    await openPublish(page, id);
    await expect(drawer(page)).toContainText('Sign in to keep the published copy up to date.');
    await closeWithEscape(page);

    await page.goto('/#/settings');
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    await expect.poll(async () => Object.keys((await published(page))[0]!.cards).length, { timeout: 15_000 }).toBe(3);
  });
});

test.describe('the account in Settings', () => {
  test('sign in, sign out, and delete the account: the public decks go, the local decks stay', async ({ page }) => {
    const id = await psalmsDeck(page);
    await openPublish(page, id);
    await signInInDrawer(page);
    await publish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    await page.waitForTimeout(300);
    await page.reload();

    await page.goto('/#/settings');
    await expect(page.getByText('Signed in as Reader')).toBeVisible();
    await page.getByRole('button', { name: 'Delete my account' }).click();
    await page.getByRole('dialog', { name: 'Delete your account?' }).getByRole('button', { name: 'Delete my account' }).click();
    await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
    expect(await published(page)).toHaveLength(0);
    expect((await cloud(page)).user).toBeNull();

    await page.goto(`/#/decks/${id}/cards`);
    await expect(page.getByRole('link', { name: 'Psalm 23:1' })).toBeVisible(); // still on this device
    await page.goto(`/#/decks/${id}`);
    await page.getByRole('button', { name: 'Deck actions' }).click();
    await expect(page.getByRole('button', { name: 'Publish deck' })).toBeVisible(); // and no longer published
  });
});

test.describe('in Spanish, and accessibility', () => {
  test('the publish drawer explains the copyright rule in Spanish', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'es-ES' });
    const page = await ctx.newPage();
    await page.goto('/#/decks/new');
    await page.getByLabel('Título').fill('Salmo');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: 'Acciones de la baraja' }).click();
    await page.getByRole('button', { name: 'Publicar baraja' }).click();
    const d = page.getByRole('dialog', { name: 'Publicar baraja' });
    await expect(d).toContainText('Inicia sesión con Google para publicar');
    await d.getByRole('button', { name: 'Continuar con Google' }).click();
    await d.getByRole('button', { name: '¿Por qué solo algunas traducciones?' }).click();
    await expect(page.getByRole('dialog', { name: '¿Por qué solo algunas traducciones?' })).toContainText('derechos de autor');
    await ctx.close();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the publish drawer has no accessibility violations in each state (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      const audit = async () => {
        await page.waitForTimeout(700);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      };
      const id = await psalmsDeck(page, null);
      await openPublish(page, id);
      await audit(); // signed out
      await signInInDrawer(page);
      await audit(); // signed in, nothing chosen yet
      await picker(page, 'Translation').click();
      await page.getByRole('dialog', { name: 'Select a translation' }).getByRole('button', { name: 'King James Version (KJV)' }).click();
      await publish(page);
      await expect(page.getByText('Deck published')).toBeVisible();
      await page.waitForTimeout(300);
      await page.reload();
      await openPublish(page, id);
      await audit(); // published
      await ctx.close();
    });
  }
});

test.describe('the community rules before publishing', () => {
  const pressPublish = (page: Page) => drawer(page).getByRole('button', { name: 'Publish', exact: true }).click();

  test('the first time, Publish opens a separate drawer with only the rules; one button agrees and publishes', async ({ page }) => {
    const id = await psalmsDeck(page, 'KJV');
    await openPublish(page, id);
    await signInInDrawer(page);
    // the publish drawer itself has nothing about the rules
    await expect(drawer(page)).not.toContainText('Community rules');
    await expect(drawer(page).getByRole('checkbox')).toHaveCount(0);

    await pressPublish(page);
    const rules = rulesDrawer(page);
    await expect(rules).toBeVisible();
    await expect(rules).toContainText('Only publish text you are allowed to share');
    await expect(rules).toContainText('Keep it about Scripture');
    await expect(rules).toContainText('No hateful, harassing, sexual, violent, illegal or spam content');
    await expect(rules.getByRole('link', { name: 'Read the full terms' })).toHaveAttribute('href', 'https://simple-bible-memory.web.app/terms');
    await expect(rules.getByRole('checkbox')).toHaveCount(0); // no box: the button is the agreement
    expect((await published(page)).length).toBe(0); // nothing is published until they agree

    await rules.getByRole('button', { name: 'Agree and publish' }).click();
    await expect(page.getByText('Deck published')).toBeVisible();
    expect((await published(page)).length).toBe(1);
  });

  test('Cancel (or Back) closes only the rules and publishes nothing; the publish drawer is still there', async ({ page }) => {
    const id = await psalmsDeck(page, 'KJV');
    await openPublish(page, id);
    await signInInDrawer(page);
    await pressPublish(page);
    await rulesDrawer(page).getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await expect(rulesDrawer(page)).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    expect((await published(page)).length).toBe(0);

    await pressPublish(page); // asked again, since they did not agree
    await expect(rulesDrawer(page)).toBeVisible();
    await page.goBack(); // the phone's Back closes the rules, not the publish drawer under them
    await expect(rulesDrawer(page)).toHaveCount(0);
    await expect(drawer(page)).toBeVisible();
    expect((await published(page)).length).toBe(0);
  });

  test('after agreeing once, the next deck publishes straight away, with no rules drawer', async ({ page }) => {
    const first = await psalmsDeck(page, 'KJV');
    await openPublish(page, first);
    await signInInDrawer(page);
    await publish(page);
    await expect(page.getByText('Deck published')).toBeVisible();

    const second = await psalmsDeck(page, 'KJV');
    await openPublish(page, second);
    await pressPublish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    await expect(rulesDrawer(page)).toHaveCount(0);
    expect((await published(page)).length).toBe(2);
  });

  test('if the connection is down after agreeing, the agreement is still remembered (and the deck syncs when it can)', async ({ page }) => {
    const id = await psalmsDeck(page, 'KJV');
    await openPublish(page, id);
    await signInInDrawer(page);
    await setFake(page, { offline: true });
    await pressPublish(page);
    await rulesDrawer(page).getByRole('button', { name: 'Agree and publish' }).click();
    await expect(rulesDrawer(page)).toHaveCount(0);
    await expect(drawer(page)).toContainText('Waiting for a connection'); // the deck is marked published and is sent when the connection is back
    await page.keyboard.press('Escape');

    await setFake(page, { offline: false });
    const second = await psalmsDeck(page, 'KJV');
    await openPublish(page, second);
    await pressPublish(page);
    await expect(page.getByText('Deck published')).toBeVisible();
    await expect(rulesDrawer(page)).toHaveCount(0); // not asked a second time
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`the rules drawer has no accessibility violations (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      const id = await psalmsDeck(page, 'KJV');
      await openPublish(page, id);
      await signInInDrawer(page);
      await pressPublish(page);
      await expect(rulesDrawer(page)).toBeVisible();
      await page.waitForTimeout(500);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await ctx.close();
    });
  }
});
