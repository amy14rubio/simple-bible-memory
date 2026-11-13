import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blueLetterUrl, commentarySite, commentaryUrl, strongsNumber, versesOfReference, wordForEnglish, type OriginalWord } from './wordData';
import { wordAt } from './useLongPressWord';

const w = (pos: number, gloss: string | null, strongs = 'G0001'): OriginalWord => ({ pos, language: 'greek', text: 'x', transliteration: 'x', parsingFull: null, strongs, gloss });

describe('which verses', () => {
  it('names the verses of one chapter, and nothing else', () => {
    expect(versesOfReference('John 3:16')?.map((v) => v.verse)).toEqual([16]);
    expect(versesOfReference('Philippians 4:6-7')?.map((v) => v.verse)).toEqual([6, 7]);
    expect(versesOfReference('Juan 3:16')?.[0]).toMatchObject({ book: 'John', code: 'JHN', chapter: 3 });
    expect(versesOfReference('John 3')).toBeNull(); // a whole chapter
    expect(versesOfReference('Romans 8:38-9:2')).toBeNull(); // across chapters
    expect(versesOfReference('Hello')).toBeNull();
  });
});

describe('links', () => {
  it('writes Strong numbers the way people know them', () => {
    expect(strongsNumber('G0649')).toBe('G649');
    expect(strongsNumber('H0430')).toBe('H430');
    expect(blueLetterUrl('G0025')).toBe('https://www.blueletterbible.org/lexicon/g25/kjv/tr/0-1/');
    expect(blueLetterUrl('H0430')).toBe('https://www.blueletterbible.org/lexicon/h430/kjv/wlc/0-1/');
  });
  it('points at the verse in Bible Hub for English and StudyLight for Spanish', () => {
    const at = (r: string) => versesOfReference(r)![0]!;
    expect(commentaryUrl(at('John 3:16'))).toBe('https://biblehub.com/commentaries/john/3-16.htm');
    expect(commentaryUrl(at('Psalm 23:1'))).toBe('https://biblehub.com/commentaries/psalms/23-1.htm');
    expect(commentaryUrl(at('1 Corinthians 13:4'))).toBe('https://biblehub.com/commentaries/1_corinthians/13-4.htm');
    expect(commentaryUrl(at('Song of Solomon 1:1'))).toBe('https://biblehub.com/commentaries/songs/1-1.htm');
    expect(commentaryUrl(at('Juan 3:16'), 'es')).toBe('https://www.studylight.org/commentaries/spa/mhm/john-3.html');
    expect(commentaryUrl(at('1 Corinthians 13:4'), 'es')).toBe('https://www.studylight.org/commentaries/spa/mhm/1-corinthians-13.html');
    // the StudyLight pages that were opened by hand, one per kind of book name
    for (const [reference, page] of [['Psalm 1:1', 'psalms-1'], ['1 Chronicles 1:1', '1-chronicles-1'], ['1 Corinthians 1:1', '1-corinthians-1'], ['Acts 1:1', 'acts-1'], ['Ecclesiastes 1:1', 'ecclesiastes-1'],
      ['Lamentations 1:1', 'lamentations-1'], ['Jude 1', 'jude-1'], ['Genesis 1:1', 'genesis-1'], ['Song of Solomon 1:1', 'song-of-solomon-1'], ['Romans 5:8', 'romans-5']] as const) {
      expect(commentaryUrl(versesOfReference(reference)![0]!, 'es')).toBe(`https://www.studylight.org/commentaries/spa/mhm/${page}.html`);
    }
    expect(commentarySite('en')).toBe('Bible Hub');
    expect(commentarySite('es')).toBe('StudyLight');
  });
});

describe('the word that was pressed', () => {
  const verse = [w(1, 'For'), w(2, null), w(3, 'God', 'G2316'), w(4, 'so'), w(5, 'loved', 'G0025'), w(6, 'the'), w(7, 'He gave', 'G1325'), w(8, 'the'), w(9, 'world')];
  it('finds the original word whose English holds it', () => {
    expect(wordForEnglish(verse, 'loved', 0.3)?.strongs).toBe('G0025');
    expect(wordForEnglish(verse, 'gave', 0.6)?.strongs).toBe('G1325'); // "He gave" is one word
    expect(wordForEnglish(verse, 'Zebra', 0.5)).toBeNull();
  });
  it('picks the nearer one when the English word is there twice', () => {
    expect(wordForEnglish(verse, 'the', 0.05)?.pos).toBe(6);
    expect(wordForEnglish(verse, 'the', 0.95)?.pos).toBe(8);
  });
});

describe('the word under a finger', () => {
  it('finds the word around a character, even at its end', () => {
    expect(wordAt('For God so loved', 9)?.word).toBe('so');
    expect(wordAt('For God so loved', 3)?.word).toBe('For');
    expect(wordAt('the world, that', 9)?.word).toBe('world');
    expect(wordAt('a  b', 2)).toBeNull();
  });
});

describe('the Spanish Greek dictionary file (UBS, CC BY-SA 4.0)', () => {
  const file = JSON.parse(readFileSync('web-data/ubs-es/greek.json', 'utf8')) as { license: string; entries: Record<string, { l: string; s: { g?: string[]; d?: string }[] }> };
  it('has the Greek words by Strong number, in Spanish, under the UBS license', () => {
    expect(file.license).toBe('CC BY-SA 4.0');
    expect(Object.keys(file.entries).length).toBeGreaterThan(5300);
    expect(file.entries['G0025']!.l.normalize('NFC')).toBe('ἀγαπάω'.normalize('NFC'));
    expect(file.entries['G0025']!.s[0]!.g).toContain('amar');
    expect(file.entries['G2316']!.s[0]!.g).toContain('Dios');
  });
  it('has no leftover UBS markup, and every entry has a sense', () => {
    for (const [code, entry] of Object.entries(file.entries)) {
      expect(code).toMatch(/^G\d{4}[a-z]?$/);
      expect(entry.s.length).toBeGreaterThan(0);
    }
    expect(JSON.stringify(file.entries)).not.toMatch(/\{[A-Z]:|\bS:\d|\d{12,}/);
  });
});
