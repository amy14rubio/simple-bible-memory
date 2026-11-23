import { describe, it, expect, beforeAll } from 'vitest';
import { languageName, loadLanguageNames } from './languageNames';

/** The file is not in git (it comes from YouVersion), so the tests that need it only run in a copy that has it. */
const files = import.meta.glob<{ default: Record<string, string[]> }>('./languageNames.json', { eager: true });
const names = Object.values(files)[0]?.default;

describe('the names of the languages in the translation picker', () => {
  beforeAll(async () => { await loadLanguageNames(); });

  it.skipIf(!names)('in Spanish each name starts with a capital letter, with its accents', () => {
    expect(languageName('en', 'es')).toBe('Inglés'); // (from the phone's own names)
    expect(languageName('es', 'es')).toBe('Español');
    expect(languageName('fr', 'es')).toBe('Francés');
    expect(languageName('de', 'es')).toBe('Alemán');
    expect(languageName('pt', 'es')).toBe('Portugués'); // (from YouVersion's names)
    expect(languageName('ru', 'es')).toBe('Ruso');
    expect(languageName('ar', 'es')).toBe('Árabe (Egipto)'); // a capital that is itself an accented letter
    expect(languageName('zh', 'es')).toBe('Chino (simplificado, China)');
  });

  it.skipIf(!names)('every Spanish name in the file starts with a capital letter, and keeps the accents the phone knows', () => {
    const phone = new Intl.DisplayNames(['es'], { type: 'language', fallback: 'none' });
    let checked = 0;
    for (const code of Object.keys(names!)) {
      const shown = languageName(code, 'es')!;
      expect(shown, code).toMatch(/^[^\p{L}]*\p{Lu}/u); // the first letter (a name may begin with an apostrophe)
      const fromPhone = (() => { try { return phone.of(code); } catch { return undefined; } })();
      if (fromPhone && fromPhone !== code && names![code]![1]) {
        const word = (x: string) => x.toLowerCase().split(/[\s(]/)[0]!;
        expect(word(shown), code).toBe(word(fromPhone)); // the same word, accents included (the file may add a region: "árabe (Egipto)")
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('without the file the phone\'s own names are used, with a capital letter', () => {
    expect(languageName('en', 'en')).toBe('English');
    expect(languageName('fr', 'en')).toBe('French');
    expect(languageName('fr', 'es')).toBe('Francés');
  });
});
