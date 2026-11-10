import { describe, expect, it } from 'vitest';
import { buildSnapshot, previewVerses, MAX_VERSES_PER_DECK, SNAPSHOT_VERSION } from './snapshot';
import type { Card } from '../../domain/types';

const card = (reference: string, verseText: string, translationCode: string | null = null): Card => ({ id: reference, reference, verseText, note: null, translationCode, createdAt: 0, updatedAt: 0 });

describe('which verses a widget may show', () => {
  it('verses in open or own text, with the translation when there is one', () => {
    const verses = previewVerses({ translationCode: 'KJV' }, [card('John 3:16', 'For God so loved the world.'), card('Psalm 23:1', 'Mi pastor.', 'RV1909')]);
    expect(verses).toEqual([{ ref: 'John 3:16', text: 'For God so loved the world.', tr: 'KJV' }, { ref: 'Psalm 23:1', text: 'Mi pastor.', tr: 'RV1909' }]);
  });
  it('your own words have no translation label', () => {
    expect(previewVerses({ translationCode: 'OWN' }, [card('Mine 1:1', 'Text')])).toEqual([{ ref: 'Mine 1:1', text: 'Text' }]);
    expect(previewVerses({ translationCode: null }, [card('Mine 1:1', 'Text')])).toEqual([{ ref: 'Mine 1:1', text: 'Text' }]);
  });
  it('licensed text never goes on a widget, whether the deck or the card is licensed', () => {
    expect(previewVerses({ translationCode: 'NASB2020' }, [card('John 3:16', 'licensed text')])).toEqual([]);
    expect(previewVerses({ translationCode: 'YV111' }, [card('John 3:16', 'licensed text')])).toEqual([]);
    expect(previewVerses({ translationCode: 'KJV' }, [card('A 1:1', 'open'), card('B 1:1', 'licensed', 'NASB2020')])).toEqual([{ ref: 'A 1:1', text: 'open', tr: 'KJV' }]);
  });
  it('a verse whose text has not been fetched yet is left out', () => {
    expect(previewVerses({ translationCode: 'KJV' }, [card('John 3:16', '   ')])).toEqual([]);
  });
  it('long verses are cut, extra spaces and line breaks tidied, and a deck gives a limited number', () => {
    const [v] = previewVerses({ translationCode: 'KJV' }, [card('X 1:1', `${'word '.repeat(200)}\nend`)]);
    expect(v!.text.length).toBeLessThanOrEqual(320);
    expect(v!.text.endsWith('…')).toBe(true);
    expect(v!.text).not.toContain('\n');
    expect(previewVerses({ translationCode: 'KJV' }, Array.from({ length: 200 }, (_, i) => card(`P ${i}:1`, 'x')))).toHaveLength(MAX_VERSES_PER_DECK);
  });
});

describe('the snapshot', () => {
  it('has a version, the time, and everything the widgets show', () => {
    const content = { decks: [{ id: 'a', title: 'A', due: 2, cards: 5 }], stats: { memorized: 3, mastered: 1, total: 9, counts: { new: 1, learning: 2, young: 3, mature: 4 } }, verseDecks: [], licensedDecks: [] };
    const s = buildSnapshot({ language: 'en', theme: 'system', custom: undefined, labels: {}, content, now: 5 });
    expect(JSON.parse(JSON.stringify(s))).toMatchObject({ v: SNAPSHOT_VERSION, updatedAt: 5, decks: content.decks, stats: content.stats });
  });
});
