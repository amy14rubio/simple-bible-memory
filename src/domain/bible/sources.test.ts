import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { autofillSources, BIBLE_SOURCES, isLicensed, isExcluded, isOffered, NOT_LICENSED_CODES, registerCatalogue, sourceFor, sourceLanguages, BIBLICA_ORGANIZATION } from './sources';
import { OPEN_TRANSLATIONS } from '../sharing/translations';

describe('the texts that can be filled in', () => {
  it('knows each one by its code', () => {
    expect(sourceFor('NASB2020')).toMatchObject({ yvId: 2692, kind: 'licensed', language: 'en' });
    expect(sourceFor('LBLA')).toMatchObject({ yvId: 89, kind: 'licensed', language: 'es' });
    expect(sourceFor('KJV')).toBeUndefined();
    expect(sourceFor(null)).toBeUndefined();
  });

  it('licensed texts carry the publisher\'s notice and link; open ones do not need them', () => {
    for (const s of BIBLE_SOURCES) {
      if (s.kind === 'licensed') {
        expect(s.publisher?.notice.length, s.code).toBeGreaterThan(20);
        expect(s.publisher?.url, s.code).toMatch(/^https:\/\//);
      } else {
        expect(isLicensed(s.code)).toBe(false);
      }
    }
    for (const code of ['NASB2020', 'NASB1995', 'AMP', 'LBLA', 'NBLA']) {
      expect(sourceFor(code)?.publisher?.notice, code).toContain('Lockman');
      expect(sourceFor(code)?.publisher?.url, code).toBe('https://www.lockman.org');
    }
  });

  it('codes are unique, and an open text that the app already publishes is one of the open translations', () => {
    expect(new Set(BIBLE_SOURCES.map((s) => s.code)).size).toBe(BIBLE_SOURCES.length);
    expect(new Set(BIBLE_SOURCES.map((s) => s.yvId)).size).toBe(BIBLE_SOURCES.length);
    for (const s of BIBLE_SOURCES.filter((x) => x.kind === 'open')) expect(OPEN_TRANSLATIONS.map((t) => t.code), s.code).toContain(s.code);
    for (const s of BIBLE_SOURCES.filter((x) => x.kind === 'licensed')) expect(OPEN_TRANSLATIONS.map((t) => t.code), s.code).not.toContain(s.code);
  });

  it('has no Biblica or Passion Translation text: their agreements are not used', () => {
    const names = BIBLE_SOURCES.map((s) => `${s.code} ${s.name} ${s.publisher?.name ?? ''}`).join(' ');
    expect(names).not.toMatch(/NIV|NIrV|NVI|Biblica|Passion|BroadStreet/i);
  });

  it('can be listed by language', () => {
    expect(autofillSources('es').map((s) => s.code)).toEqual(['RV1909', 'LBLA', 'NBLA']);
    expect(autofillSources('en').map((s) => s.code)).toContain('NASB2020');
    expect(autofillSources().length).toBe(BIBLE_SOURCES.length);
  });

  it('anything not known to be open is licensed, so a translation added later is safe by default', () => {
    for (const code of ['NASB2020', 'AMP', 'LBLA', 'YV12345', 'NIV', 'whatever']) expect(isLicensed(code), code).toBe(true);
    for (const code of ['KJV', 'WEB', 'ASV', 'YLT', 'DARBY', 'BSB', 'RV1909', 'OWN', 'OTHER']) expect(isLicensed(code), code).toBe(false);
    expect(isLicensed(null)).toBe(false);
    expect(isLicensed('')).toBe(false);
  });

  it('the codes that are NOT licensed are the same list as the one in firestore.rules (rules cannot import code, so this checks they agree)', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    const list = /function licensedCode\(t\) \{ return t != null && !\(t in \[([^\]]*)\]\)/.exec(rules)?.[1] ?? '';
    const inRules = [...list.matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]);
    expect(inRules.sort()).toEqual([...NOT_LICENSED_CODES].sort());
  });
});

describe('the rest of what the platform offers', () => {
  const item = (id: number, abbreviation: string, title: string, language: string, organization: string | null = null) => ({ id, abbreviation, title, language, organization });

  it('Biblica\'s versions (in any language) and The Passion Translation are left out', () => {
    expect(isExcluded(item(111, 'NIV11', 'New International Version 2011', 'en', BIBLICA_ORGANIZATION))).toBe(true);
    expect(isExcluded(item(21, 'BDS', 'La Bible du Semeur', 'fr', BIBLICA_ORGANIZATION))).toBe(true);
    expect(isExcluded(item(709, 'tpt', 'The Passion Translation', 'en'))).toBe(true);
    expect(isExcluded(item(1, 'XYZ', 'Something Else', 'en', 'someone'))).toBe(false);
  });

  it('adds every other version as a licensed text, with a code made from its id, in its own language', () => {
    registerCatalogue([
      item(21, 'BDS', 'La Bible du Semeur', 'fr', BIBLICA_ORGANIZATION),
      item(500, 'LSG', 'Louis Segond 1910', 'fr'),
      item(501, 'SBLG', 'SBL Greek New Testament', 'grc'),
      item(2692, 'NASB2020', 'New American Standard Bible 2020', 'en'), // hand-listed already: not twice
      item(900, 'PTA', 'Almeida', 'pt-BR'),
    ]);
    expect(sourceFor('YV500')).toMatchObject({ code: 'YV500', yvId: 500, name: 'Louis Segond 1910', language: 'fr', kind: 'licensed', tag: 'LSG' });
    expect(sourceFor('YV21')).toMatchObject({ name: 'YouVersion 21' }); // not offered, but a card that already names it still resolves by its id
    expect(autofillSources('fr').map((b) => b.code)).toEqual(['YV500']);
    expect(autofillSources('pt').map((b) => b.code)).toEqual(['YV900']); // a regional tag is found under its language
    expect(autofillSources().filter((b) => b.yvId === 2692)).toHaveLength(1);
    expect(sourceLanguages().map((l) => l.code)).toEqual(expect.arrayContaining(['fr', 'grc', 'pt']));
    expect(isOffered('YV500')).toBe(true);
    expect(isOffered('YV21')).toBe(false); // Biblica's: never fetched, even if a card names it
    expect(isOffered('NASB2020')).toBe(true);
    registerCatalogue([]);
  });

  it('a card from another device can be read before the list has loaded: its code is enough to ask for it', () => {
    registerCatalogue([]);
    expect(sourceFor('YV3034')).toMatchObject({ yvId: 3034, kind: 'licensed' });
    expect(sourceFor('NOPE')).toBeUndefined();
  });
});
