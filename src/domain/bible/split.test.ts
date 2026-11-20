import { describe, it, expect } from 'vitest';
import { canSplit, namedVerses, splitPassage, verseReference } from './split';
import { parseReference, withPassage } from './reference';

// Example text only: short, clearly-labeled stand-ins typed for the tests, not a real translation.
const PSALM_130 = '1 Example one first. 2 Example two second. 3 Example three third. 4 Example four fourth. 5 Example five fifth. 6 Example six sixth. 7 Example seven seventh. 8 Example eight eighth.';

describe('reference spans', () => {
  it('reports where a reference points inside one chapter', () => {
    expect(parseReference('Psalm 130')?.span).toEqual({ chapter: 130, verses: null });
    expect(parseReference('Psalm 130:1-2')?.span).toEqual({ chapter: 130, verses: [1, 2] });
    expect(parseReference('John 3:16')?.span).toEqual({ chapter: 3, verses: [16] });
    expect(parseReference('Romans 8:28,30-31')?.span).toEqual({ chapter: 8, verses: [28, 30, 31] });
    expect(parseReference('Jude 3-5')?.span).toEqual({ chapter: 1, verses: [3, 4, 5] });
  });
  it('is null when the reference spans chapters', () => {
    expect(parseReference('Genesis 1:1-2:3')?.span).toBeNull();
    expect(parseReference('Psalm 23-24')?.span).toBeNull();
  });
  it('withPassage keeps the way the user wrote the book', () => {
    expect(withPassage('Salmos 130:1-2', '130:2')).toBe('Salmos 130:2');
    expect(withPassage('1 Cor 13:4-7', '13:5')).toBe('1 Cor 13:5');
    expect(withPassage('Psalm130', '130:1')).toBe('Psalm130:1');
    expect(withPassage('not a reference', '1:1')).toBeNull();
  });
});

describe('canSplit', () => {
  it('is true for a chapter or several verses of one chapter', () => {
    for (const r of ['Psalm 130', 'Psalm 130:1-2', 'Romans 8:28,30', 'Salmos 130', 'Jude 3-5']) expect(canSplit(r)).toBe(true);
  });
  it('is false for a single verse, cross-chapter references and non-references', () => {
    for (const r of ['John 3:16', 'Genesis 1:1-2:3', 'Psalm 23-24', 'My own label', '', 'Jude 3']) expect(canSplit(r)).toBe(false);
  });
});

describe('splitPassage: whole chapter', () => {
  it('splits Psalm 130 into 8 verses, one per number', () => {
    const r = splitPassage('Psalm 130', PSALM_130);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.verses).toHaveLength(8);
    expect(r.verses.map((v) => v.reference)).toEqual(['Psalm 130:1', 'Psalm 130:2', 'Psalm 130:3', 'Psalm 130:4', 'Psalm 130:5', 'Psalm 130:6', 'Psalm 130:7', 'Psalm 130:8']);
    expect(r.verses[0]!.text).toBe('Example one first.');
    expect(r.verses[7]!.text).toBe('Example eight eighth.');
  });
  it('keeps the Spanish style of the reference', () => {
    const r = splitPassage('Salmos 130', PSALM_130);
    expect(r.ok && r.verses[1]!.reference).toBe('Salmos 130:2');
  });
  it('ignores a title before verse 1 and reports it', () => {
    const r = splitPassage('Psalm 130', `Psalm 130\nA song of ascents.\n${PSALM_130}`);
    expect(r.ok && r.verses).toHaveLength(8);
    expect(r.ok && r.ignored).toBe('Psalm 130\nA song of ascents.');
    expect(r.ok && r.verses[0]!.text).toBe('Example one first.');
  });
  it('does not mistake the 130 in the title for verse 1', () => {
    const r = splitPassage('Psalm 130', `Psalm 130 ${PSALM_130}`);
    expect(r.ok && r.verses).toHaveLength(8);
  });
  it('stops where the numbers stop', () => {
    const r = splitPassage('Psalm 130', '1 One. 2 Two. 3 Three.');
    expect(r.ok && r.verses.map((v) => v.verse)).toEqual([1, 2, 3]);
  });
});

describe('splitPassage: verse ranges and lists', () => {
  it('splits Psalm 130:1-2 into 2 verses', () => {
    const r = splitPassage('Psalm 130:1-2', '1 Example one first. 2 Example two second.');
    expect(r.ok && r.verses.map((v) => [v.reference, v.text])).toEqual([
      ['Psalm 130:1', 'Example one first.'],
      ['Psalm 130:2', 'Example two second.'],
    ]);
  });
  it('handles a range that does not start at 1', () => {
    const r = splitPassage('John 3:16-18', '16 Sixteen text. 17 Seventeen text. 18 Eighteen text.');
    expect(r.ok && r.verses.map((v) => v.reference)).toEqual(['John 3:16', 'John 3:17', 'John 3:18']);
  });
  it('handles a list with gaps', () => {
    const r = splitPassage('Romans 8:28,30', '28 Twenty-eight text. 30 Thirty text.');
    expect(r.ok && r.verses.map((v) => v.reference)).toEqual(['Romans 8:28', 'Romans 8:30']);
  });
  it('handles a one-chapter book written without a chapter', () => {
    const r = splitPassage('Jude 3-4', '3 Three text. 4 Four text.');
    expect(r.ok && r.verses.map((v) => v.reference)).toEqual(['Jude 3', 'Jude 4']);
  });
  it('accepts the first number being left out when copying', () => {
    const r = splitPassage('Psalm 130:1-2', 'Example one first. 2 Example two second.');
    expect(r.ok && r.verses.map((v) => v.text)).toEqual(['Example one first.', 'Example two second.']);
  });
});

describe('splitPassage: other ways verse numbers appear', () => {
  it('understands [2], (2) and superscript numbers', () => {
    expect(splitPassage('Psalm 130:1-3', '[1] One text. [2] Two text. [3] Three text.').ok).toBe(true);
    expect(splitPassage('Psalm 130:1-3', '(1) One text. (2) Two text. (3) Three text.').ok).toBe(true);
    const r = splitPassage('Psalm 130:1-3', '¹One text. ²Two text. ³Three text.');
    expect(r.ok && r.verses.map((v) => v.text)).toEqual(['One text.', 'Two text.', 'Three text.']);
  });
  it('works with numbers directly before a word and verses on separate lines', () => {
    const r = splitPassage('Psalm 130:1-2', '1Example one first.\n2 Example two\nsecond line.');
    expect(r.ok && r.verses.map((v) => v.text)).toEqual(['Example one first.', 'Example two\nsecond line.']);
  });
  it('does not treat a number inside a verse as the next verse unless it is the next number', () => {
    const r = splitPassage('Psalm 130:1-2', '1 He had 5 sheep. 2 Example two second.');
    expect(r.ok && r.verses.map((v) => v.text)).toEqual(['He had 5 sheep.', 'Example two second.']);
  });
  it('does not take part of "2:1" or "12" for verse 2', () => {
    const r = splitPassage('Psalm 130:1-2', '1 See 2:1 and 12 more. 2 Example two second.');
    expect(r.ok && r.verses.map((v) => v.text)).toEqual(['See 2:1 and 12 more.', 'Example two second.']);
  });
});

describe('splitPassage: problems come with a code, so they can be shown in any language', () => {
  const code = (ref: string, text: string) => { const r = splitPassage(ref, text); return r.ok ? 'ok' : { code: r.code, verse: r.verse }; };
  it('names the kind of problem', () => {
    expect(code('Psalm 130', 'No numbers here.')).toEqual({ code: 'no-markers', verse: undefined });
    expect(code('Psalm 130:1-3', '1 One. 3 Three.')).toEqual({ code: 'missing-verse', verse: 2 });
    expect(code('John 3:16', '16 text')).toEqual({ code: 'single-verse', verse: undefined });
    expect(code('Genesis 1:1-2:3', '1 a 2 b')).toEqual({ code: 'not-splittable', verse: undefined });
    expect(code('Psalm 130:1-2', '1 2 Two.')).toEqual({ code: 'empty-verse', verse: 1 });
  });
});

describe('splitPassage: problems are explained', () => {
  it('says so when the numbers are missing', () => {
    const r = splitPassage('Psalm 130', 'Just a paragraph without any verse numbers in it.');
    expect(!r.ok && r.message).toMatch(/couldn't find the verse numbers/);
  });
  it('names the missing verse in a range', () => {
    const r = splitPassage('Psalm 130:1-3', '1 One text. 3 Three text.');
    expect(!r.ok && r.message).toMatch(/verse 2/);
  });
  it('refuses single verses and cross-chapter references', () => {
    expect(!splitPassage('John 3:16', '16 text').ok).toBe(true);
    expect(!splitPassage('Genesis 1:1-2:3', '1 a 2 b').ok).toBe(true);
    expect(!splitPassage('My own label', '1 a 2 b').ok).toBe(true);
  });
  it('rejects a verse that has a number but no text', () => {
    const r = splitPassage('Psalm 130:1-2', '1 2 Example two second.');
    expect(!r.ok && r.message).toMatch(/Verse 1 has no text/);
  });
});

describe('the pieces Autofill uses to split', () => {
  it('writes the reference of one verse in the same style as the original, in either language', () => {
    expect(verseReference('Psalm 130:1-3', 2)).toBe('Psalm 130:2');
    expect(verseReference('Psalm 130', 5)).toBe('Psalm 130:5');
    expect(verseReference('Salmos 130', 1)).toBe('Salmos 130:1');
    expect(verseReference('1 Juan 1:1-3', 3)).toBe('1 Juan 1:3');
    expect(verseReference('Jude 3-5', 4)).toBe('Jude 4'); // a one-chapter book written without a chapter number
    expect(verseReference('John 3:16', 16)).toBe('John 3:16');
    expect(verseReference('not a reference', 1)).toBeNull();
  });
  it('lists the verses a reference names, or says nothing for a whole chapter', () => {
    expect(namedVerses('Psalm 130:1-3')).toEqual([1, 2, 3]);
    expect(namedVerses('Romans 8:28,30')).toEqual([28, 30]);
    expect(namedVerses('Psalm 130')).toBeNull();
  });
});
