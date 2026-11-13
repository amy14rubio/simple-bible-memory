import { describe, expect, it } from 'vitest';
import { blueLetterUrl, commentaryUrl, strongsNumber, versesOfReference, wordForEnglish, type OriginalWord } from './wordData';
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
  it('points at the verse in StudyLight', () => {
    expect(commentaryUrl(versesOfReference('Psalm 23:1')![0]!)).toBe('https://www.studylight.org/commentary/psalms/23-1.html');
    expect(commentaryUrl(versesOfReference('1 Corinthians 13:4')![0]!)).toBe('https://www.studylight.org/commentary/1-corinthians/13-4.html');
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
