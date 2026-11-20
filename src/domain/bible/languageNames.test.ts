import { describe, it, expect, beforeAll } from 'vitest';
import { languageName, loadLanguageNames } from './languageNames';
import names from './languageNames.json';

describe('the names of the languages in the translation picker', () => {
  beforeAll(async () => { await loadLanguageNames(); });

  it('in Spanish each name starts with a capital letter, with its accents', () => {
    expect(languageName('en', 'es')).toBe('Inglés'); // (from the phone's own names)
    expect(languageName('es', 'es')).toBe('Español');
    expect(languageName('fr', 'es')).toBe('Francés');
    expect(languageName('de', 'es')).toBe('Alemán');
    expect(languageName('pt', 'es')).toBe('Portugués'); // (from YouVersion's names)
    expect(languageName('ru', 'es')).toBe('Ruso');
    expect(languageName('ar', 'es')).toBe('Árabe (Egipto)'); // a capital that is itself an accented letter
    expect(languageName('zh', 'es')).toBe('Chino (simplificado, China)');
  });

  it('every Spanish name in the file starts with a capital letter, and keeps the accents the phone knows', () => {
    const phone = new Intl.DisplayNames(['es'], { type: 'language', fallback: 'none' });
    let checked = 0;
    for (const code of Object.keys(names as Record<string, string[]>)) {
      const shown = languageName(code, 'es')!;
      expect(shown, code).toMatch(/^[^\p{L}]*\p{Lu}/u); // the first letter (a name may begin with an apostrophe)
      const fromPhone = (() => { try { return phone.of(code); } catch { return undefined; } })();
      if (fromPhone && fromPhone !== code && (names as Record<string, string[]>)[code]![1]) {
        const word = (x: string) => x.toLowerCase().split(/[\s(]/)[0]!;
        expect(word(shown), code).toBe(word(fromPhone)); // the same word, accents included (the file may add a region: "árabe (Egipto)")
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('in English the names are left as they are', () => {
    expect(languageName('en', 'en')).toBe('English');
    expect(languageName('fr', 'en')).toBe('French');
  });
});
