import { describe, expect, it } from 'vitest';
import { usfmBook, usfmPassages } from './usfm';

const verses = async (_b: string, chapter: number) => ({ 8: 39, 22: 31 })[chapter] ?? 20;

describe('YouVersion passage names (USFM)', () => {
  it('maps every canonical book to its code, in Bible order', () => {
    expect(usfmBook('Genesis')).toBe('GEN');
    expect(usfmBook('Psalm')).toBe('PSA');
    expect(usfmBook('Song of Solomon')).toBe('SNG');
    expect(usfmBook('Philippians')).toBe('PHP');
    expect(usfmBook('1 John')).toBe('1JN');
    expect(usfmBook('Revelation')).toBe('REV');
    expect(usfmBook('Nonsense')).toBeNull();
  });

  it('names a verse, a range of verses, and a chapter', async () => {
    expect(await usfmPassages('John 3:16', verses)).toEqual(['JHN.3.16']);
    expect(await usfmPassages('Philippians 4:6-7', verses)).toEqual(['PHP.4.6-7']);
    expect(await usfmPassages('Psalm 23', verses)).toEqual(['PSA.23']);
  });

  it('understands Spanish names and abbreviations', async () => {
    expect(await usfmPassages('Filipenses 4:6-7', verses)).toEqual(['PHP.4.6-7']);
    expect(await usfmPassages('Salmos 23', verses)).toEqual(['PSA.23']);
  });

  it('asks for each stretch of a list of verses separately', async () => {
    expect(await usfmPassages('Philippians 4:6-7,13', verses)).toEqual(['PHP.4.6-7', 'PHP.4.13']);
  });

  it('single-chapter books: "Jude 3" is verse 3 of chapter 1', async () => {
    expect(await usfmPassages('Jude 3', verses)).toEqual(['JUD.1.3']);
    expect(await usfmPassages('Jude 3-4', verses)).toEqual(['JUD.1.3-4']);
  });

  it('several chapters are asked for one chapter at a time', async () => {
    expect(await usfmPassages('Psalm 23-25', verses)).toEqual(['PSA.23', 'PSA.24', 'PSA.25']);
  });

  it('a stretch across chapters asks how long the first chapter is', async () => {
    expect(await usfmPassages('Romans 8:38-9:2', verses)).toEqual(['ROM.8.38-39', 'ROM.9.1-2']);
    expect(await usfmPassages('Psalm 22:30-23:1', verses)).toEqual(['PSA.22.30-31', 'PSA.23.1']);
    expect(await usfmPassages('Romans 8:38-10:2', verses)).toEqual(['ROM.8.38-39', 'ROM.9', 'ROM.10.1-2']);
  });

  it('is null for something that is not a reference', async () => {
    expect(await usfmPassages('hello', verses)).toBeNull();
    expect(await usfmPassages('', verses)).toBeNull();
  });
});
