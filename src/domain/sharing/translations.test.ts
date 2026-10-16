import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { OPEN_TRANSLATIONS, OWN_WORDS, PUBLISHABLE_CODES, canPublishTranslation, publishBlock, translationLanguage } from './translations';

describe('which translations may be published', () => {
  it('open translations and "my own words" may; copyrighted or missing ones may not', () => {
    for (const code of ['KJV', 'WEB', 'ASV', 'YLT', 'DARBY', 'RV1909', OWN_WORDS]) expect(canPublishTranslation(code)).toBe(true);
    for (const code of ['NIV', 'ESV', 'RVR1960', 'NKJV', 'NLT', 'kjv', '']) expect(canPublishTranslation(code)).toBe(false);
    expect(canPublishTranslation(null)).toBe(false);
    expect(canPublishTranslation(undefined)).toBe(false);
  });

  it('says why a deck cannot be published', () => {
    expect(publishBlock(null)).toBe('no-translation');
    expect(publishBlock('')).toBe('no-translation');
    expect(publishBlock('NIV')).toBe('copyrighted');
    expect(publishBlock('KJV')).toBeNull();
    expect(publishBlock(OWN_WORDS)).toBeNull();
  });

  it('knows each open translation\'s language, and leaves "my own words" open', () => {
    expect(translationLanguage('KJV')).toBe('en');
    expect(translationLanguage('RV1909')).toBe('es');
    expect(translationLanguage(OWN_WORDS)).toBeNull();
    expect(translationLanguage('NIV')).toBeNull();
  });

  it('is the same list as the one in firestore.rules (rules cannot import code, so this checks they agree)', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const map = /languageOf\(translation\)\s*\{\s*return\s*\{([^}]*)\}/.exec(rules)?.[1] ?? '';
    const inRules = Object.fromEntries([...map.matchAll(/'([A-Z0-9]+)':\s*'(\w+)'/g)].map((m) => [m[1], m[2]]));
    expect(inRules).toEqual(Object.fromEntries(OPEN_TRANSLATIONS.map((t) => [t.code, t.language])));
    expect(rules).toContain(`d.translation == '${OWN_WORDS}'`);
    expect(PUBLISHABLE_CODES).toHaveLength(OPEN_TRANSLATIONS.length + 1);
  });
});
