import { test, expect, type Browser, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createDeck, tapFirstBankWord, wordBankOpen, closeWithEscape } from './helpers';

const spanishPage = async (browser: Browser, colorScheme: 'light' | 'dark' = 'light') => {
  const ctx = await browser.newContext({ locale: 'es-ES', colorScheme });
  return { ctx, page: await ctx.newPage() };
};

const language = (page: Page, name: string) => page.getByRole('group', { name: /^(Language|Idioma)$/ }).getByRole('radio', { name, exact: true });

// Spanish-interface helpers: create things through the Spanish screens.
async function esCreateDeck(page: Page, title: string): Promise<string> {
  await page.goto('/#/decks/new');
  await page.getByLabel('Título').fill(title);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
  return page.url().match(/#\/decks\/([0-9a-f-]{36})$/)![1]!;
}
async function esAddCard(page: Page, deckId: string, reference: string, passage: string) {
  await page.goto(`/#/cards/new?deck=${deckId}`);
  await page.getByLabel('Versículo(s)').fill(reference);
  await page.getByLabel('Pasaje', { exact: true }).fill(passage);
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(`${reference} agregado`)).toBeVisible(); // the toast; the form stays open, cleared
  await page.goto(`/#/decks/${deckId}/cards`);
  await page.reload();
}
async function esSetKinds(page: Page, name: RegExp) {
  await page.goto('/#/settings/card-kinds');
  // The page loads the saved choice after it appears, which can undo a click made too early: retry until it sticks.
  await expect(async () => {
    await page.getByRole('radio', { name }).check();
    await page.waitForTimeout(150);
    await expect(page.getByRole('radio', { name })).toBeChecked({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}
const esRecallOnly = (page: Page) => esSetKinds(page, /^Recordar el pasaje/);

test.describe('which language the app starts in', () => {
  test('a Spanish browser gets Spanish by default, with the page language and title to match', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    await page.goto('/');
    await expect(page.getByText('Aún no hay barajas')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Barajas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Estadísticas' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle('Memoria Bíblica Simple');
    await ctx.close();
  });

  test('an English browser gets English', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No decks yet')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Simple Bible Memory');
  });

  test('a browser in a language the app does not have (French) falls back to English', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'fr-FR' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByText('No decks yet')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await ctx.close();
  });
});

test.describe('the language setting', () => {
  test('switching to Español changes the app text right away, and back again', async ({ page }) => {
    await page.goto('/#/settings/language');
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
    await language(page, 'Español').click();
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible(); // the page itself changes at once
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page).toHaveTitle('Memoria Bíblica Simple');
    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Notificaciones' })).toBeVisible();
    await expect(page.getByLabel('Tarjetas nuevas por día', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Idioma/ })).toContainText('Español'); // the row shows the choice
    await page.goto('/#/settings/language');
    await language(page, 'English').click();
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the choice survives a reload, and is also stored in the database (not only the page)', async ({ page }) => {
    await page.goto('/#/settings/language');
    await language(page, 'Español').click();
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible();
    await page.waitForTimeout(400); // let the database write finish
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('language-pref')); // forget the quick cache: the database must remember
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible();
  });

  test('"System" follows the browser, and a chosen language overrides it', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    await page.goto('/#/settings/language');
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible(); // system -> Spanish browser
    await expect(language(page, 'Sistema')).toBeChecked();
    await language(page, 'English').click();
    await expect(page.getByRole('heading', { name: 'Language' })).toBeVisible(); // chosen English beats the Spanish browser
    await language(page, 'System').click();
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible();
    await ctx.close();
  });

  test('says that only the app text changes', async ({ page }) => {
    await page.goto('/#/settings/language');
    // the explanation is behind the "i" next to Language, not small print on the page
    await expect(page.getByText('Changes the text of the app only.')).toHaveCount(0);
    await page.getByRole('button', { name: 'Language', exact: true }).click(); // the title in the top bar has the "i"
    await expect(page.getByRole('dialog', { name: 'Language' })).toContainText('Changes the text of the app only. Your verses and passages stay exactly as you typed them.');
    await closeWithEscape(page);
    await language(page, 'Español').click();
    await page.getByRole('button', { name: 'Idioma', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Idioma' })).toContainText('Cambia solo el texto de la aplicación.');
  });

  test('the language names are always written in their own language', async ({ page }) => {
    await page.goto('/#/settings/language');
    await expect(language(page, 'English')).toBeVisible();
    await expect(language(page, 'Español')).toBeVisible();
    await language(page, 'Español').click();
    await expect(language(page, 'English')).toBeVisible(); // not "Inglés"
    await expect(language(page, 'Español')).toBeVisible();
  });
});

test.describe('verses are not translated', () => {
  test('the verse text, the reference and the source stay exactly as typed when the language changes', async ({ page }) => {
    const id = await createDeck(page, 'My verses');
    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel('Verse(s)').fill('John 3:16');
    await page.getByLabel('Note', { exact: true }).fill('Example translation');
    await page.getByLabel('Passage', { exact: true }).fill('Example passage text, typed exactly like this.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('John 3:16 added')).toBeVisible();
    await page.reload(); // clears the toast

    await page.goto('/#/settings/language');
    await language(page, 'Español').click();
    await expect(page.getByRole('heading', { name: 'Idioma' })).toBeVisible();

    await page.goto(`/#/decks/${id}/cards`);
    await expect(page.getByRole('columnheader', { name: 'Versículo' })).toBeVisible(); // interface: translated
    await expect(page.getByRole('link', { name: 'John 3:16' })).toBeVisible(); // the reference: as typed, not "Juan"
    await expect(page.getByText('Example passage text, typed exactly like this.')).toBeVisible(); // the passage: untouched
    await page.getByText('Example passage text, typed exactly like this.').click();
    await expect(page.getByLabel('Versículo(s)')).toHaveValue('John 3:16');
    await expect(page.getByLabel('Nota', { exact: true })).toHaveValue('Example translation');
    await expect(page.getByLabel('Pasaje', { exact: true })).toHaveValue('Example passage text, typed exactly like this.');
  });

  test('the deck name is yours too', async ({ page }) => {
    await createDeck(page, 'Commute verses');
    await page.goto('/#/settings/language');
    await language(page, 'Español').click();
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Commute verses/ })).toBeVisible();
  });

  test('English references still work in the Spanish app, and Spanish ones in the English app', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    const deck = await esCreateDeck(page, 'Baraja');
    await page.goto(`/#/cards/new?deck=${deck}`);
    await page.getByLabel('Versículo(s)').fill('John 3:16'); // English book name in the Spanish app
    await expect(page.getByRole('button', { name: /Buscar en Bible Gateway/ })).toBeVisible();
    await page.getByLabel('Versículo(s)').fill('Salmos 130:1');
    await expect(page.getByRole('button', { name: /Buscar en Bible Gateway/ })).toBeVisible();
    await ctx.close();
  });
});

test.describe('the app in Spanish', () => {
  test('decks, forms, validation messages and menus', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    await page.goto('/');
    await page.getByRole('link', { name: 'Crea tu primera baraja' }).click();
    await expect(page.getByRole('heading', { name: 'Nueva baraja' })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar' }).click(); // empty title
    await expect(page.getByRole('alert')).toContainText('El título de la baraja es obligatorio');
    await page.getByLabel('Título').fill('Versículos del camino');
    await expect(page.getByLabel('Descripción')).toBeVisible();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/#\/decks\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Aún no hay nada que estudiar')).toBeVisible();

    await page.getByRole('link', { name: 'Nueva tarjeta' }).click();
    await expect(page.getByRole('heading', { name: 'Añadir tarjeta' })).toBeVisible();
    await page.getByLabel('Versículo(s)').fill('Juan 3:16');
    await page.getByRole('button', { name: 'Guardar' }).click(); // no passage
    await expect(page.getByRole('alert')).toContainText('El pasaje es obligatorio');
    await expect(page.getByLabel('Versículo(s)')).toHaveValue('Juan 3:16'); // what you typed is kept
    await page.getByLabel('Pasaje', { exact: true }).fill('Texto de ejemplo escrito por la persona.');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Juan 3:16 agregado')).toBeVisible(); // the toast, in Spanish
    await page.goto(`/#/decks/${new URL(page.url().split('#')[1]!, 'http://x').searchParams.get('deck')}/cards`);
    await expect(page.getByRole('columnheader', { name: 'Pasaje' })).toBeVisible();

    await page.goto('/');
    await page.getByRole('button', { name: 'Acciones de Versículos del camino' }).click();
    await expect(page.getByRole('link', { name: 'Ver tarjetas' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Práctica extra', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Renombrar baraja' })).toBeVisible();
    await page.getByRole('button', { name: 'Eliminar baraja' }).click();
    await expect(page.getByRole('dialog')).toContainText('se eliminarán de forma permanente');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).dispatchEvent('click');
    await ctx.close();
  });

  test('the + menu, search and empty states', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    await page.goto('/');
    await page.getByRole('button', { name: 'Añadir' }).click();
    await expect(page.getByRole('button', { name: 'Nueva baraja' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva tarjeta' })).toBeVisible();
    await closeWithEscape(page);
    await esCreateDeck(page, 'Salmos');
    await page.goto('/');
    await page.getByRole('button', { name: 'Buscar barajas' }).click();
    await page.getByLabel('Buscar barajas', { exact: true }).fill('zzz');
    await expect(page.getByText('Ninguna baraja coincide con "zzz".')).toBeVisible();
    await ctx.close();
  });

  test('studying: counts, tiles, ratings with Spanish intervals, and the finished screen', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    const id = await esCreateDeck(page, 'Estudio');
    await esAddCard(page, id, 'Juan 3:16', 'Texto de ejemplo uno.');
    await esAddCard(page, id, 'Salmos 23:1', 'Texto de ejemplo dos.');
    await esRecallOnly(page);

    await page.goto(`/#/decks/${id}`);
    await expect(page.getByText('2 tarjetas para estudiar hoy.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Tarjeta/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Escribir/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Espacio en blanco/ })).toBeVisible();
    await expect(page.getByText('Próximamente')).toBeVisible();

    await page.getByRole('link', { name: /Tarjeta/ }).click();
    await expect(page.getByRole('list', { name: 'Tarjetas restantes' })).toContainText('Nuevas: 2');
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await expect(page.getByRole('group', { name: '¿Qué tan bien lo recordaste?' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Otra vez.*1 min/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Bien.*10 min/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Fácil.*8 d/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Difícil/ })).toBeVisible();
    await page.getByRole('button', { name: /^Fácil/ }).click();
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await page.getByRole('button', { name: /^Fácil/ }).click();

    await expect(page.getByRole('heading', { name: 'Sesión completada' })).toBeVisible();
    await expect(page.getByText('2 tarjetas repasadas')).toBeVisible();
    await page.getByRole('link', { name: 'Volver a la baraja' }).click();
    await expect(page.getByRole('heading', { name: 'Estás al día' })).toBeVisible();
    await expect(page.getByText(/Tu próximo repaso es en \d+ (min|h|d|mes|meses)/)).toBeVisible();
    await ctx.close();
  });

  test('typing the passage and typing the verse: feedback in Spanish', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    const id = await esCreateDeck(page, 'Escribir');
    await esAddCard(page, id, 'Juan 3:16', 'Uno dos tres cuatro.');
    await esRecallOnly(page);
    await page.goto(`/#/decks/${id}/study/type`);
    await expect(page.getByRole('button', { name: 'Mostrar respuesta' })).toHaveCount(1);
    await page.getByLabel('Escribe el versículo de memoria').fill('uno dos cinco cuatro');
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await expect(page.getByRole('region', { name: 'Tu respuesta' })).toContainText('uno dos cinco cuatro');
    await expect(page.getByRole('region', { name: 'Versículo correcto' })).toContainText('Uno dos tres cuatro.');
    await expect(page.getByRole('button', { name: /^Otra vez.*sugerido/ })).toBeVisible();

    // identify card: type the verse
    await esSetKinds(page, /^Identificar el versículo/);
    await page.goto(`/#/decks/${id}/study/type`);
    await expect(page.getByText('Uno dos tres cuatro.')).toBeVisible();
    await page.getByLabel(/Escribe el versículo, por ejemplo/).fill('Juan 3:17');
    await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
    await expect(page.getByText('Tu respuesta')).toBeVisible();
    await expect(page.getByText('Juan 3:17')).toBeVisible();
    await ctx.close();
  });

  test('blanks (word bank) and multiple choice in Spanish', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    const id = await esCreateDeck(page, 'Espacios');
    await esAddCard(page, id, 'Juan 3:16', 'Alfa bravo charlie delta echo foxtrot golf hotel india juliet.');
    await esAddCard(page, id, 'Salmos 23:1', 'Texto de ejemplo dos.');
    await esAddCard(page, id, 'Romanos 8:28', 'Texto de ejemplo tres.');
    await esRecallOnly(page);
    await page.goto(`/#/decks/${id}/study/blanks`);
    const bank = page.getByRole('group', { name: 'Banco de palabras' });
    await expect(bank).toBeVisible();
    expect(await bank.getByRole('button').count()).toBeGreaterThan(1);
    while (await wordBankOpen(page)) await tapFirstBankWord(page);
    await expect(page.getByRole('button', { name: /^(Otra vez|Difícil|Bien|Fácil)/ }).first()).toBeVisible(); // every blank is done

    await esSetKinds(page, /^Identificar el versículo/);
    await page.goto(`/#/decks/${id}/study/blanks`);
    const choices = page.getByRole('group', { name: 'Elige el versículo' });
    await expect(choices).toBeVisible();
    await choices.getByRole('button').first().click();
    await expect(choices.getByText('Correcto')).toBeVisible();
    await ctx.close();
  });

  test('statistics in Spanish, with the book names in Spanish', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    const id = await esCreateDeck(page, 'Libros');
    await esAddCard(page, id, 'John 3:16', 'Texto uno.');
    await esAddCard(page, id, 'Psalm 23:1', 'Texto dos.');
    await page.goto('/#/stats');
    await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeAttached();
    const picker = page.getByRole('button', { name: 'Mostrar estadísticas de: Todas las barajas' });
    await expect(picker).toBeVisible();
    await picker.click();
    const popup = page.getByRole('dialog', { name: 'Selecciona una baraja' });
    await expect(popup.getByRole('button', { name: 'Libros' })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Cancelar' })).toBeAttached();
    await popup.getByRole('button', { name: 'Cancelar' }).dispatchEvent('click');
    await expect(page.getByText('Tarjetas añadidas')).toBeVisible();
    await expect(page.getByText('Versículos memorizados')).toBeVisible();
    await expect(page.getByText('Días desde que empezaste')).toBeVisible();
    const books = page.getByRole('region', { name: 'Progreso por libro' });
    await expect(books.getByText('Juan')).toBeVisible(); // "John" in the app, "Juan" in the Spanish interface
    await expect(books.getByText('Salmos')).toBeVisible();
    await expect(page.getByRole('img', { name: /^Tarjetas por etapa: \d+ nuevas, 0 en aprendizaje/ })).toBeVisible();
    await page.getByRole('button', { name: 'Tarjetas por etapa', exact: true }).click();
    await expect(page.getByRole('dialog').getByText('Aún no se han estudiado.')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Cerrar' })).toBeAttached();
    await ctx.close();
  });

  test('Bible Gateway helper and splitting verses in Spanish', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    await ctx.route('https://www.biblegateway.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>stub</p>' }));
    const id = await esCreateDeck(page, 'Separar');
    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel('Versículo(s)').fill('Salmos 130:1-2');
    await page.getByLabel('Pasaje', { exact: true }).fill('1 Texto de ejemplo uno. 2 Texto de ejemplo dos.');

    await page.getByRole('button', { name: /Buscar en Bible Gateway/ }).click();
    const gateway = page.getByRole('dialog', { name: 'Buscar un pasaje bíblico' });
    await expect(gateway).toContainText('Bible Gateway se abrirá en el navegador de tu dispositivo.');
    const popup = ctx.waitForEvent('page');
    await gateway.getByRole('button', { name: /Continuar a Bible Gateway/ }).click();
    expect((await popup).url()).toBe('https://www.biblegateway.com/passage/?search=Psalm+130%3A1-2'); // the link itself is not translated

    await page.getByRole('button', { name: 'Separar en versículos' }).click();
    const split = page.getByRole('dialog', { name: 'Separar en versículos' });
    await expect(split).toContainText('Esto crea 2 tarjetas, una por versículo.');
    await expect(split).toContainText('tendrás 4 tarjetas de estudio');
    await split.getByRole('button', { name: 'Crear 2 tarjetas' }).click();
    await expect(page.getByText('2 versículos agregados')).toBeVisible();
    await page.goto(`/#/decks/${new URL(page.url().split('#')[1]!, 'http://x').searchParams.get('deck')}/cards`);
    await expect(page.getByRole('link', { name: 'Salmos 130:2', exact: true })).toBeVisible();

    // and the explanation when it cannot split
    await page.goto(`/#/cards/new?deck=${id}`);
    await page.getByLabel('Versículo(s)').fill('Salmos 130:1-3');
    await page.getByLabel('Pasaje', { exact: true }).fill('1 Uno. 3 Tres.');
    await page.getByRole('button', { name: 'Separar en versículos' }).click();
    await expect(page.getByRole('dialog', { name: 'Separar en versículos' })).toContainText('No encontramos el versículo 2 en el texto.');
    await ctx.close();
  });

  test('no English interface text is left on the main Spanish screens', async ({ browser }) => {
    const { ctx, page } = await spanishPage(browser);
    const id = await esCreateDeck(page, 'Baraja de prueba');
    await esAddCard(page, id, 'Juan 3:16', 'Texto de ejemplo uno.');
    const english = /\b(Settings|Decks|Cancel|Save|Statistics|Delete|Browse|Practice|Show answer|Again|Hard|Good|Easy|Passage|Verse|Search|Add card|New card|New deck|Study|Description|Title|Source|Theme|Language|Notifications|Account|caught up|Session|review)\b/;
    const screens = ['/', '/#/settings', '/#/stats', `/#/decks/${id}`, `/#/decks/${id}/cards`, `/#/decks/${id}?practice=1`, `/#/cards/new?deck=${id}`, `/#/decks/${id}/edit`, `/#/decks/${id}/study/flashcard`, '/#/decks/nope', '/#/nowhere'];
    for (const path of screens) {
      await page.goto(path);
      await page.waitForTimeout(250);
      const text = await page.locator('body').innerText();
      expect(text.match(english), `English text on ${path}: ${text.match(english)?.[0]}`).toBeNull();
    }
    await ctx.close();
  });
});

test.describe('accessibility in Spanish', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`no WCAG A/AA violations on the main screens in Spanish (${scheme})`, async ({ browser }) => {
      test.setTimeout(90_000);
      const { ctx, page } = await spanishPage(browser, scheme);
      const audit = async (label: string) => {
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.help}`), `violations on ${label}`).toEqual([]);
      };
      await page.goto('/');
      await expect(page.getByText('Aún no hay barajas')).toBeVisible();
      await audit('inicio vacío');
      const id = await esCreateDeck(page, 'Accesible');
      await esAddCard(page, id, 'Juan 3:16', 'Texto de ejemplo.');
      await page.goto('/');
      await audit('inicio');
      await page.getByRole('button', { name: 'Añadir' }).click();
      await audit('menú añadir');
      await closeWithEscape(page);
      await page.goto(`/#/decks/${id}`);
      await expect(page.getByText(/tarjetas? para estudiar hoy/)).toBeVisible();
      await audit('baraja');
      await page.goto(`/#/cards/new?deck=${id}`);
      await page.getByLabel('Versículo(s)').fill('Salmos 130:1-2');
      await page.getByLabel('Pasaje', { exact: true }).fill('1 Uno. 2 Dos.');
      await audit('formulario de tarjeta');
      await page.getByRole('button', { name: 'Separar en versículos' }).click();
      await audit('separar en versículos');
      await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).dispatchEvent('click');
      await page.goto(`/#/decks/${id}/study/flashcard`);
      await page.getByRole('button', { name: 'Mostrar respuesta' }).click();
      await audit('estudio con valoraciones');
      await page.goto('/#/stats');
      await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeAttached();
      await audit('estadísticas');
      await page.goto('/#/settings');
      await audit('ajustes');
      await ctx.close();
    });
  }
});

test('Settings has one Language row showing the current choice; it opens a list of System, English and Español', async ({ page }) => {
  await page.goto('/#/settings');
  await expect(page.getByRole('group', { name: 'Language' })).toHaveCount(0); // no cramped options in Settings
  const row = page.getByRole('link', { name: /^Language/ });
  await expect(row).toContainText('System');
  await row.click();
  await expect(page).toHaveURL(/#\/settings\/language$/);
  const group = page.getByRole('group', { name: 'Language' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  for (const name of ['System', 'English', 'Español']) await expect(group.getByRole('radio', { name, exact: true })).toBeVisible();
  await expect(group.getByRole('radio', { name: 'System', exact: true })).toBeChecked();
});
