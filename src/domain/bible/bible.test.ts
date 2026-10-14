import { describe, it, expect, vi } from 'vitest';
import { parseReference, isBibleReference } from './reference';
import { bibleGatewaySearchUrl, BIBLE_GATEWAY_ORIGIN } from './bibleGateway';
import { openExternal } from '../../platform/openExternal';

describe('parseReference: valid references', () => {
  const cases: [string, string][] = [
    ['John 3:16', 'John 3:16'],
    ['Psalm 130:1', 'Psalm 130:1'],
    ['psalms 23', 'Psalm 23'],
    ['  john   3 : 16  ', 'John 3:16'],
    ['jn 3:16-18', 'John 3:16-18'],
    ['John3:16', 'John 3:16'],
    ['1 Cor 13:4-7', '1 Corinthians 13:4-7'],
    ['1Cor 13:4', '1 Corinthians 13:4'],
    ['I John 1:9', '1 John 1:9'],
    ['First John 4:8', '1 John 4:8'],
    ['2 Tim. 3:16–17', '2 Timothy 3:16-17'], // en dash
    ['Song of Solomon 2:1', 'Song of Solomon 2:1'],
    ['Isaiah 40:31', 'Isaiah 40:31'],
    ['Rom 8', 'Romans 8'],
    ['Romans 8:28,30', 'Romans 8:28,30'],
    ['Genesis 1:1-2:3', 'Genesis 1:1-2:3'],
    ['Psalm 23-24', 'Psalm 23-24'],
    ['Jude 3', 'Jude 3'],
    ['Philemon 1:4-7', 'Philemon 1:4-7'],
    ['Revelation 21:4', 'Revelation 21:4'],
    ['1st John 2:1', '1 John 2:1'],
    // Spanish: accents optional, result is always the English book name
    ['Salmos 130:1', 'Psalm 130:1'],
    ['salmo 23', 'Psalm 23'],
    ['Juan 3:16', 'John 3:16'],
    ['Génesis 1:1-3', 'Genesis 1:1-3'],
    ['genesis 1:1', 'Genesis 1:1'],
    ['Éxodo 20:3', 'Exodus 20:3'],
    ['1 Corintios 13:4-7', '1 Corinthians 13:4-7'],
    ['Primera de Juan 1:9'.replace(' de', ''), '1 John 1:9'],
    ['Apocalipsis 21:4', 'Revelation 21:4'],
    ['Isaías 40:31', 'Isaiah 40:31'],
    ['Cantares 2:1', 'Song of Solomon 2:1'],
    ['Santiago 1:5', 'James 1:5'],
    ['Hechos 2:38', 'Acts 2:38'],
  ];
  it.each(cases)('%s -> %s', (input, normalized) => {
    expect(parseReference(input)?.normalized).toBe(normalized);
  });
});

describe('parseReference: invalid references', () => {
  it.each([
    '', '   ', 'John', 'John 3:', 'John :16', '3:16', 'Example 1:1', 'Narnia 3:16', 'John 0:1', 'John 3:0',
    'John 3:16-3', 'John 3:18-16', 'John 3:16-', 'John 999:1', 'John 3:999', 'Genesis 2:1-1:3', '1 John', 'Hello world',
    'John 3:16 and more', 'John 3:16;4:1', 'John 3 16', 'x'.repeat(100), 'Sal', 'Salmos', 'Narnia 1:1',
  ])('rejects %j', (input) => {
    expect(isBibleReference(input)).toBe(false);
  });
  it('does not read "Isaiah" as "I saiah" (Roman numeral prefix needs a space)', () => {
    expect(parseReference('Isaiah 1:1')?.book).toBe('Isaiah');
    expect(parseReference('Isa 1:1')?.book).toBe('Isaiah');
  });
});

describe('bibleGatewaySearchUrl', () => {
  it('builds the documented passage URL, with no version so the visitor keeps their own', () => {
    expect(bibleGatewaySearchUrl('Psalm 130:1')).toBe('https://www.biblegateway.com/passage/?search=Psalm+130%3A1');
    expect(bibleGatewaySearchUrl('1 cor 13:4-7')).toBe('https://www.biblegateway.com/passage/?search=1+Corinthians+13%3A4-7');
  });
  it('returns null for text that is not a reference, so no link is offered', () => {
    expect(bibleGatewaySearchUrl('')).toBeNull();
    expect(bibleGatewaySearchUrl('Example 1:1')).toBeNull();
  });
  it('cannot be used to inject parameters, fragments, hosts or schemes', () => {
    for (const evil of [
      'John 3:16&version=evil', 'John 3:16#frag', 'John 3:16?x=1', 'John 3:16\n&a=b', 'John 3:16%26x=1',
      '<script>alert(1)</script>', 'javascript:alert(1)', 'https://evil.example/John 3:16', '//evil.example John 3:16',
      'John 3:16"><img src=x>', "John 3:16' OR '1'='1",
    ]) {
      expect(bibleGatewaySearchUrl(evil)).toBeNull();
    }
  });
  it('always stays on the Bible Gateway origin with exactly one search parameter', () => {
    for (const ref of ['John 3:16', 'Psalm 23', 'Genesis 1:1-2:3', '2 Timothy 3:16,17']) {
      const u = new URL(bibleGatewaySearchUrl(ref)!);
      expect(u.origin).toBe(BIBLE_GATEWAY_ORIGIN);
      expect(u.pathname).toBe('/passage/');
      expect([...u.searchParams.keys()]).toEqual(['search']);
      expect(u.hash).toBe('');
    }
  });
});

describe('openExternal', () => {
  it('opens https URLs in a new tab with noopener and noreferrer', () => {
    const open = vi.fn();
    expect(openExternal('https://www.biblegateway.com/passage/?search=John+3%3A16', open as never)).toBe(true);
    expect(open).toHaveBeenCalledWith('https://www.biblegateway.com/passage/?search=John+3%3A16', '_blank', 'noopener,noreferrer');
  });
  it('refuses anything that is not https', () => {
    const open = vi.fn();
    for (const bad of ['javascript:alert(1)', 'http://www.biblegateway.com', 'data:text/html,hi', 'file:///etc/passwd', 'not a url', '']) {
      expect(openExternal(bad, open as never)).toBe(false);
    }
    expect(open).not.toHaveBeenCalled();
  });
});
