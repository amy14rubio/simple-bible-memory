import { describe, it, expect } from 'vitest';
import { WORD_BANK_SIZE, buildWordBank, generateCloze, hashSeed, isCorrectWord, wordsOf, type Difficulty, type Segment } from './cloze';
import { normalizeText } from './normalize';

const VERSE = 'In the beginning God created the heavens and the earth and the earth was without form and void and darkness was over the face of the deep';
const OTHER = ['light', 'water', 'spirit', 'firmament', 'evening', 'morning'];
const blanksOf = (segments: Segment[]) => segments.filter((s) => s.type === 'blank') as Extract<Segment, { type: 'blank' }>[];
const texts = (bank: { text: string }[]) => bank.map((w) => w.text);

describe('word bank size', () => {
  it('is 8', () => {
    expect(WORD_BANK_SIZE).toBe(8);
  });

  it('is always exactly 8 words, at every blank, whatever the difficulty, when there are enough different words', () => {
    for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
      const segments = generateCloze(VERSE, d, 4);
      for (let step = 0; step < blanksOf(segments).length; step++) {
        expect(buildWordBank({ segments, step, extraWords: OTHER, seed: 'a' })).toHaveLength(8);
      }
    }
  });

  it('is smaller only when there are not enough different words, and never invents any', () => {
    const one = buildWordBank({ segments: generateCloze('Amen', 'hard', 1), step: 0, seed: 'a' });
    expect(texts(one)).toEqual(['Amen']);
    const few = buildWordBank({ segments: generateCloze('Amen', 'hard', 1), step: 0, extraWords: ['Alleluia', 'Glory'], seed: 'a' });
    expect(texts(few).sort()).toEqual(['Alleluia', 'Amen', 'Glory']);
  });

  it('fills the rest from other verses when this verse has too few words', () => {
    const segments = generateCloze('Amen amen', 'hard', 1);
    const bank = buildWordBank({ segments, step: 0, extraWords: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'], seed: 'a' });
    expect(bank).toHaveLength(8);
  });
});

describe('what is in the bank', () => {
  it('always contains the word that belongs in the current blank, exactly once', () => {
    const segments = generateCloze(VERSE, 'hard', 2);
    blanksOf(segments).forEach((blank, step) => {
      const bank = buildWordBank({ segments, step, extraWords: OTHER, seed: 'a' });
      expect(bank.filter((w) => isCorrectWord(w.text, blank.answer))).toHaveLength(1);
    });
  });

  it('has no repeated words, so every option is different', () => {
    const segments = generateCloze(VERSE, 'hard', 2);
    blanksOf(segments).forEach((_, step) => {
      const keys = buildWordBank({ segments, step, extraWords: OTHER, seed: 'a' }).map((w) => normalizeText(w.text));
      expect(new Set(keys).size).toBe(keys.length);
    });
  });

  it('never includes a second word that equals the right answer (a wrong tap is never right by accident)', () => {
    for (let n = 0; n < 15; n++) {
      const segments = generateCloze(VERSE, 'hard', n);
      blanksOf(segments).forEach((blank, step) => {
        const bank = buildWordBank({ segments, step, extraWords: ['the', 'God', ...OTHER], seed: `s${n}` });
        expect(bank.filter((w) => isCorrectWord(w.text, blank.answer))).toHaveLength(1);
      });
    }
  });

  it('ignores single letters', () => {
    const bank = buildWordBank({ segments: generateCloze('Amen', 'easy', 1), step: 0, extraWords: ['a', 'I', 'ok'], seed: 'x' });
    expect(texts(bank).sort()).toEqual(['Amen', 'ok']);
  });

  it('is empty when there is no blank at this step', () => {
    expect(buildWordBank({ segments: generateCloze('', 'hard', 1), step: 0, seed: 'a' })).toEqual([]);
    expect(buildWordBank({ segments: generateCloze('Amen', 'hard', 1), step: 5, seed: 'a' })).toEqual([]);
  });

  it('gives every word in a bank its own id', () => {
    const bank = buildWordBank({ segments: generateCloze(VERSE, 'hard', 2), step: 0, extraWords: OTHER, seed: 'a' });
    expect(new Set(bank.map((w) => w.id)).size).toBe(bank.length);
  });
});

describe('reshuffling and reuse', () => {
  const segments = generateCloze(VERSE, 'hard', 3);

  it('is the same for the same seed and step (stable while you look at it)', () => {
    expect(buildWordBank({ segments, step: 1, extraWords: OTHER, seed: 'one' })).toEqual(buildWordBank({ segments, step: 1, extraWords: OTHER, seed: 'one' }));
  });

  it('is reshuffled for every blank: the arrangement changes from step to step', () => {
    const steps = blanksOf(segments).length;
    expect(steps).toBeGreaterThan(3);
    const arrangements = Array.from({ length: steps }, (_, step) => texts(buildWordBank({ segments, step, extraWords: OTHER, seed: 'one' })).join('|'));
    expect(new Set(arrangements).size).toBeGreaterThan(1);
  });

  it('the position of the right word is not always the same', () => {
    const positions = new Set<number>();
    for (let n = 0; n < 40; n++) {
      const bank = buildWordBank({ segments, step: 0, extraWords: OTHER, seed: `s${n}` });
      positions.add(bank.findIndex((w) => isCorrectWord(w.text, blanksOf(segments)[0]!.answer)));
    }
    expect(positions.size).toBeGreaterThan(3);
  });

  it('words you used for earlier blanks can come back in later banks (nothing is used up)', () => {
    const blanks = blanksOf(segments);
    const first = blanks[0]!.answer;
    const reappears = blanks.slice(1).some((_, i) => texts(buildWordBank({ segments, step: i + 1, extraWords: OTHER, seed: 'one' })).some((w) => isCorrectWord(w, first)));
    expect(reappears).toBe(true);
    // and the bank for a later blank still has its own full 8 words, not a shrinking list
    expect(buildWordBank({ segments, step: blanks.length - 1, extraWords: OTHER, seed: 'one' })).toHaveLength(8);
  });
});

describe('isCorrectWord and wordsOf', () => {
  it('compares like typed answers: case, punctuation and apostrophes do not matter', () => {
    expect(isCorrectWord('God’s', 'gods')).toBe(true);
    expect(isCorrectWord('Word', 'word')).toBe(true);
    expect(isCorrectWord('Word', 'World')).toBe(false);
    expect(isCorrectWord('', '')).toBe(false);
  });
  it('lists each distinct word of some passages once', () => {
    expect(wordsOf(['The cat, the dog.', 'A dog and a bird!'])).toEqual(['The', 'cat', 'dog', 'A', 'and', 'bird']);
    expect(hashSeed('a')).toBeDefined();
  });
});
