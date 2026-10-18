import { describe, it, expect } from 'vitest';
import { CANONICAL_BOOKS, parseReference } from './reference';
import { EBIBLE_BOOK_CODES, EBIBLE_ORIGIN, ebibleUrl } from './ebible';

const v1 = (url: string | null) => new URL(url!).searchParams.get('v1');

describe('eBible book codes', () => {
  it('every book the app knows has a code, and no two books share one', () => {
    expect(CANONICAL_BOOKS).toHaveLength(66);
    for (const book of CANONICAL_BOOKS) expect(EBIBLE_BOOK_CODES[book], book).toMatch(/^[A-Z0-9]{2}$/);
    expect(new Set(Object.values(EBIBLE_BOOK_CODES)).size).toBe(66);
  });
});

describe('the eBible link', () => {
  it('opens a single verse (John 3:16 is JN3_16)', () => {
    const url = new URL(ebibleUrl('John 3:16', 'en')!);
    expect(url.origin).toBe(EBIBLE_ORIGIN);
    expect(url.pathname).toBe('/study/');
    expect(url.searchParams.get('w1')).toBe('bible');
    expect(url.searchParams.get('t1')).toBe('local:eng-web');
    expect(url.searchParams.get('v1')).toBe('JN3_16');
  });
  it('numbered books put the number last (1 Samuel, 1 Corinthians, 1 John)', () => {
    expect(v1(ebibleUrl('1 Samuel 1:1', 'en'))).toBe('S11_1');
    expect(v1(ebibleUrl('1 Corinthians 13:4-7', 'en'))).toBe('C113_4');
    expect(v1(ebibleUrl('1 John 4:8', 'en'))).toBe('J14_8');
  });
  it('a range, or a chapter, opens at its first verse (eBible cannot show a range)', () => {
    expect(v1(ebibleUrl('John 3:16-18', 'en'))).toBe('JN3_16');
    expect(v1(ebibleUrl('Psalm 23', 'en'))).toBe('PS23_1');
    expect(v1(ebibleUrl('Psalm 23:6-24:2', 'en'))).toBe('PS23_6');
  });
  it('works with abbreviations, other spellings, and one-chapter books', () => {
    expect(v1(ebibleUrl('jn 3:16', 'en'))).toBe('JN3_16');
    expect(v1(ebibleUrl('Psalms 119:105', 'en'))).toBe('PS119_105');
    expect(v1(ebibleUrl('Jude 3', 'en'))).toBe('JD1_3');
  });
  it('the language picks the translation: English World English Bible, Spanish Reina-Valera 1909', () => {
    expect(new URL(ebibleUrl('John 3:16', 'es')!).searchParams.get('t1')).toBe('local:spaRV1909');
    expect(new URL(ebibleUrl('John 3:16', null)!).searchParams.get('t1')).toBe('local:eng-web'); // no language: English
    expect(new URL(ebibleUrl('John 3:16', 'fr')!).searchParams.get('t1')).toBe('local:eng-web'); // no list for it yet
  });
  it('is null for anything that is not a reference, and cannot be steered by what is typed', () => {
    expect(ebibleUrl('hello', 'en')).toBeNull();
    expect(ebibleUrl('', 'en')).toBeNull();
    const url = new URL(ebibleUrl('John 3:16&t1=evil&v1=x https://evil.example', 'en') ?? 'https://x.invalid/');
    expect(['ebible.org', 'x.invalid']).toContain(url.hostname);
    if (url.hostname === 'ebible.org') expect(url.searchParams.get('t1')).toBe('local:eng-web');
  });
  it('every reference in the Bible parses to a link', () => {
    for (const book of CANONICAL_BOOKS) {
      const ref = book === 'Obadiah' || book === 'Philemon' || book === '2 John' || book === '3 John' || book === 'Jude' ? `${book} 1` : `${book} 1:1`;
      expect(ebibleUrl(ref, 'en'), ref).not.toBeNull();
      expect(parseReference(ref)!.book).toBe(book);
    }
  });
});
