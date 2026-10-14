import { describe, it, expect } from 'vitest';
import { checkReference } from './identify';
import { buildCitationChoices, nearMisses } from './choices';
import { CARD_KINDS, kindsFor, parseCardKindSetting } from './cardKind';

describe('checkReference (type the verse)', () => {
  it('accepts abbreviations, spacing, case and other languages', () => {
    for (const typed of ['John 3:16', 'jn 3:16', ' JOHN   3 : 16 ', 'Juan 3:16']) expect(checkReference('John 3:16', typed).correct).toBe(true);
    expect(checkReference('Juan 3:16', 'John 3:16').correct).toBe(true);
  });
  it('rejects a different verse, a different book, and empty input', () => {
    for (const typed of ['John 3:17', 'John 4:16', 'Mark 3:16', '', '   ', 'banana']) expect(checkReference('John 3:16', typed).correct).toBe(false);
  });
  it('suggests Good when right and Again when wrong (never Easy)', () => {
    expect(checkReference('John 3:16', 'jn 3:16').suggestedRating).toBe(3);
    expect(checkReference('John 3:16', 'jn 3:17').suggestedRating).toBe(1);
  });
  it('compares free-text labels word by word when they are not Bible references', () => {
    expect(checkReference('My own label', 'my   OWN label!').correct).toBe(true);
    expect(checkReference('My own label', 'my label').correct).toBe(false);
    expect(checkReference('My own label', '').correct).toBe(false);
  });
  it('compares ranges exactly', () => {
    expect(checkReference('John 3:16-18', 'jn 3:16-18').correct).toBe(true);
    expect(checkReference('John 3:16-18', 'jn 3:16').correct).toBe(false);
  });
});

describe('nearMisses', () => {
  it('keeps the same style and never includes the original', () => {
    const n = nearMisses('John 3:16');
    expect(n).toContain('John 3:17');
    expect(n).toContain('John 3:15');
    expect(n).toContain('John 4:16');
    expect(n).not.toContain('John 3:16');
    for (const r of n) expect(r.startsWith('John ')).toBe(true);
  });
  it('matches Spanish style and spacing', () => {
    expect(nearMisses('Salmos 130:1')).toContain('Salmos 130:2');
    expect(nearMisses('Salmos 130:1').every((r) => r.startsWith('Salmos '))).toBe(true);
  });
  it('keeps the length of a range and never goes below verse or chapter 1', () => {
    expect(nearMisses('John 3:16-18')).toContain('John 3:17-19');
    for (const r of nearMisses('John 1:1')) expect(r).not.toMatch(/ (0|-\d)/);
    expect(nearMisses('Psalm 23')).toContain('Psalm 24');
  });
  it('gives nothing for text that is not a reference', () => {
    expect(nearMisses('My own label')).toEqual([]);
  });
});

describe('buildCitationChoices', () => {
  const others = ['Psalm 23:1', 'Romans 8:28', 'Genesis 1:1', 'John 3:16'];

  it('contains the correct answer exactly once, plus wrong options, with no duplicates', () => {
    const c = buildCitationChoices({ correct: 'John 3:16', others, seed: 'a' })!;
    expect(c).toHaveLength(4);
    expect(c.filter((x) => x === 'John 3:16')).toHaveLength(1);
    expect(new Set(c).size).toBe(4);
  });
  it('is stable for a seed, and the correct answer is not always in the same position', () => {
    expect(buildCitationChoices({ correct: 'John 3:16', others, seed: 'x' })).toEqual(buildCitationChoices({ correct: 'John 3:16', others, seed: 'x' }));
    const positions = new Set(Array.from({ length: 30 }, (_, i) => buildCitationChoices({ correct: 'John 3:16', others, seed: `s${i}` })!.indexOf('John 3:16')));
    expect(positions.size).toBeGreaterThan(1);
  });
  it('fills with near-miss references when the learner has few other cards', () => {
    const c = buildCitationChoices({ correct: 'John 3:16', others: [], seed: 'a' })!;
    expect(c).toHaveLength(4);
    expect(c.every((x) => x.startsWith('John '))).toBe(true);
  });
  it('treats the same verse written differently as a duplicate of the correct answer', () => {
    const c = buildCitationChoices({ correct: 'John 3:16', others: ['Jn 3:16', 'Juan 3:16'], seed: 'a' })!;
    expect(c.filter((x) => /3:16$/.test(x))).toHaveLength(1);
  });
  it('returns null when it cannot make at least three options (free-text label, no other cards)', () => {
    expect(buildCitationChoices({ correct: 'My own label', others: [], seed: 'a' })).toBeNull();
    expect(buildCitationChoices({ correct: 'My own label', others: ['Other label'], seed: 'a' })).toBeNull();
  });
  it('works with free-text labels when there are enough other cards', () => {
    expect(buildCitationChoices({ correct: 'Label A', others: ['Label B', 'Label C', 'Label D'], seed: 'a' })).toHaveLength(4);
  });
});

describe('card kind settings', () => {
  it('maps the setting to the kinds studied', () => {
    expect(kindsFor('both')).toEqual(CARD_KINDS);
    expect(kindsFor('recall')).toEqual(['recall']);
    expect(kindsFor('identify')).toEqual(['identify']);
  });
  it('falls back to both for anything unexpected', () => {
    for (const bad of [undefined, null, 'x', 3, {}]) expect(parseCardKindSetting(bad)).toBe('both');
    expect(parseCardKindSetting('identify')).toBe('identify');
  });
});
