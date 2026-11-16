import { describe, it, expect } from 'vitest';
import { normalizeText, tokenize } from './normalize';
import { compareVerse } from './compare';
import { generateCloze, checkCloze, hashSeed, type Segment } from './cloze';
import { suggestRating } from './rating';

const VERSE = "Example verse: it's a test, for God-breathed words; \"quoted\" too.";
const rebuild = (segs: Segment[]) => segs.map((s) => (s.type === 'text' ? s.text : s.answer)).join('');

describe('normalization rules', () => {
  it('ignores case, punctuation and whitespace', () => {
    expect(normalizeText('  Hello,\n  WORLD!! ')).toBe('hello world');
  });
  it('treats apostrophe variants and missing apostrophes as equal', () => {
    expect(normalizeText("don't")).toBe(normalizeText('don’t'));
    expect(normalizeText("don't")).toBe(normalizeText('dont'));
  });
  it('splits on hyphens and dashes', () => {
    expect(normalizeText('God-breathed')).toBe('god breathed');
    expect(normalizeText('wait—what')).toBe('wait what');
  });
  it('matches composed and decomposed accents', () => {
    expect(normalizeText('café')).toBe(normalizeText('café'));
  });
  it('keeps digits and non-latin letters', () => {
    expect(normalizeText('Ἐν ἀρχῇ 1:1')).toBe('ἐν ἀρχῇ 1 1');
  });
  it('tokens remember their original text and position', () => {
    expect(tokenize('Hi, God’s')).toEqual([
      { text: 'Hi', key: 'hi', start: 0 },
      { text: 'God’s', key: 'gods', start: 4 },
    ]);
  });
  it('returns empty for empty or punctuation-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' ... !! ')).toEqual([]);
  });
});

describe('compareVerse', () => {
  it('is exact despite case, punctuation and spacing differences', () => {
    const c = compareVerse(VERSE, "example   VERSE it’s a test for god breathed words quoted too");
    expect(c.exact).toBe(true);
    expect(c.accuracy).toBe(1);
    expect(c.suggestedRating).toBe(3);
  });
  it('reports missing words', () => {
    const c = compareVerse('one two three four', 'one three four');
    expect(c.ops).toEqual([
      { type: 'match', word: 'one' },
      { type: 'missing', word: 'two' },
      { type: 'match', word: 'three' },
      { type: 'match', word: 'four' },
    ]);
    expect(c.accuracy).toBe(0.75);
    expect(c.exact).toBe(false);
  });
  it('reports extra words and is not exact', () => {
    const c = compareVerse('one two', 'one extra two');
    expect(c.ops.map((o) => o.type)).toEqual(['match', 'extra', 'match']);
    expect(c.exact).toBe(false);
    expect(c.accuracy).toBe(1); // every verse word was typed
  });
  it('shows a wrong word as missing + extra', () => {
    const c = compareVerse('for God so loved', 'for God so liked');
    expect(c.ops.slice(3)).toEqual([
      { type: 'missing', word: 'loved' },
      { type: 'extra', word: 'liked' },
    ]);
  });
  it('treats an empty answer as all missing and suggests Again', () => {
    const c = compareVerse('one two', '');
    expect(c.matchedCount).toBe(0);
    expect(c.accuracy).toBe(0);
    expect(c.suggestedRating).toBe(1);
  });
  it('words out of order are not matched in place', () => {
    const c = compareVerse('one two three', 'three two one');
    expect(c.exact).toBe(false);
    expect(c.matchedCount).toBe(1);
  });
  it('is reproducible', () => {
    expect(compareVerse(VERSE, 'example verse')).toEqual(compareVerse(VERSE, 'example verse'));
  });
  it('handles an expected text with no words', () => {
    expect(compareVerse('...', '').exact).toBe(true);
    expect(compareVerse('...', 'x').exact).toBe(false);
  });
});

describe('suggestRating', () => {
  it('never suggests Easy; 90%+ is Hard, below is Again, perfect is Good', () => {
    expect(suggestRating(1, true)).toBe(3);
    expect(suggestRating(0.9, false)).toBe(2);
    expect(suggestRating(0.89, false)).toBe(1);
    expect(suggestRating(0, false)).toBe(1);
  });
});

describe('generateCloze', () => {
  it('reassembles into the original verse exactly, punctuation included', () => {
    for (const d of ['easy', 'medium', 'hard', 'extreme'] as const) {
      expect(rebuild(generateCloze(VERSE, d, 7))).toBe(VERSE);
    }
  });
  it('is deterministic for a seed and varies across seeds', () => {
    const long = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
    expect(generateCloze(long, 'medium', 1)).toEqual(generateCloze(long, 'medium', 1));
    const picks = new Set(Array.from({ length: 10 }, (_, s) => JSON.stringify(generateCloze(long, 'medium', s))));
    expect(picks.size).toBeGreaterThan(1);
  });
  it('hides more words on harder levels', () => {
    const long = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima';
    const n = (d: 'easy' | 'medium' | 'hard' | 'extreme') => generateCloze(long, d, 3).filter((s) => s.type === 'blank').length;
    expect(n('easy')).toBeLessThan(n('medium'));
    expect(n('medium')).toBeLessThan(n('hard'));
    expect(n('hard')).toBeLessThan(n('extreme'));
  });
  it('extreme hides every single word, whatever its length, and nothing else', () => {
    const verse = 'In the beginning God created the heavens and the earth; so it is.';
    const segs = generateCloze(verse, 'extreme', 5);
    const blanks = segs.filter((s): s is Extract<Segment, { type: 'blank' }> => s.type === 'blank').map((s) => s.answer);
    expect(blanks).toEqual(tokenize(verse).map((w) => w.text)); // every word, in order, short ones too
    expect(blanks.length).toBe(13);
    expect(segs.filter((s) => s.type === 'text').every((s) => !/\p{L}/u.test((s as { text: string }).text))).toBe(true); // what is left is only spaces and punctuation
    expect(generateCloze(verse, 'extreme', 1)).toEqual(generateCloze(verse, 'extreme', 99)); // no randomness left: the same blanks for any seed
  });
  it('easy/medium skip short words', () => {
    const segs = generateCloze('a an the elephant', 'medium', 1);
    expect(segs.filter((s) => s.type === 'blank').map((s) => (s as { answer: string }).answer)).toEqual(['elephant']);
  });
  it('always hides at least one word, even in a one-word verse or only-short words', () => {
    expect(generateCloze('Amen', 'easy', 1).some((s) => s.type === 'blank')).toBe(true);
    expect(generateCloze('so be it', 'easy', 1).some((s) => s.type === 'blank')).toBe(true);
  });
  it('produces no blanks for text without words', () => {
    expect(generateCloze('', 'hard', 1)).toEqual([]);
    expect(generateCloze('...', 'hard', 1).some((s) => s.type === 'blank')).toBe(false);
  });
  it('hashSeed is stable', () => {
    expect(hashSeed('card-1:2')).toBe(hashSeed('card-1:2'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });
});

describe('checkCloze', () => {
  const segs = generateCloze('alpha bravo charlie delta echo foxtrot', 'hard', 5); // 4 of 6 hidden
  const answers = segs.filter((s) => s.type === 'blank').map((s) => (s as { answer: string }).answer);

  it('accepts the right answers regardless of case and punctuation', () => {
    const r = checkCloze(segs, answers.map((a) => `  ${a.toUpperCase()}! `));
    expect(r.correct.every(Boolean)).toBe(true);
    expect(r.suggestedRating).toBe(3);
  });
  it('marks wrong and empty answers incorrect', () => {
    const r = checkCloze(segs, ['wrong']);
    expect(r.correctCount).toBe(0);
    expect(r.total).toBe(answers.length);
    expect(r.suggestedRating).toBe(1);
  });
  it('scores partial answers', () => {
    expect(answers).toHaveLength(4);
    const r = checkCloze(segs, [answers[0]!, 'nope', answers[2]!, answers[3]!]);
    expect(r.correct).toEqual([true, false, true, true]);
    expect(r.accuracy).toBeCloseTo(3 / 4);
    expect(r.suggestedRating).toBe(1);
  });
});

describe('paintComparison', () => {
  it('keeps punctuation and marks only the wrong words', async () => {
    const { paintComparison } = await import('./compare');
    const p = paintComparison('John 3:16', 'John 3:17');
    expect(p.expected.map((x) => x.text).join('')).toBe('John 3:16');
    expect(p.typed.map((x) => x.text).join('')).toBe('John 3:17');
    expect(p.expected.filter((x) => x.state === 'wrong').map((x) => x.text)).toEqual(['16']);
    expect(p.typed.filter((x) => x.state === 'wrong').map((x) => x.text)).toEqual(['17']);
    expect(p.exact).toBe(false);
  });
  it('is all green when everything matches, ignoring case and punctuation', async () => {
    const { paintComparison } = await import('./compare');
    const p = paintComparison("For example, it's a test.", 'for example its a test');
    expect(p.exact).toBe(true);
    expect(p.expected.every((x) => x.state !== 'wrong')).toBe(true);
  });
  it('marks where words were skipped with a gap, but not where a word was replaced', async () => {
    const { paintComparison } = await import('./compare');
    const skipped = paintComparison('Blessed are the poor in spirit', 'Blessed are in spirit');
    expect(skipped.typed.filter((x) => x.state === 'gap')).toHaveLength(1);
    expect(skipped.typed.findIndex((x) => x.state === 'gap')).toBeGreaterThan(skipped.typed.findIndex((x) => x.text === 'are'));
    expect(skipped.expected.filter((x) => x.state === 'wrong').map((x) => x.text)).toEqual(['the', 'poor']);
    const trailing = paintComparison('one two three', 'one two');
    expect(trailing.typed.at(-2)?.state).toBe('gap');
    const replaced = paintComparison('one two three', 'one deux three');
    expect(replaced.typed.some((x) => x.state === 'gap')).toBe(false);
  });
});
