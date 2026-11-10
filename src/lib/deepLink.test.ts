import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { deckIdFromLink } from './deepLink';
import { deckShareUrl } from './site';

describe('which public deck a link opens', () => {
  const id = '068c781d-0ff3-4a10-8c1a-6ccd8099fc55';
  it('the app link from the share page', () => expect(deckIdFromLink(`simplebiblememory://discover/${id}`)).toBe(id));
  it('the shared web link itself', () => expect(deckIdFromLink(deckShareUrl(id))).toBe(id));
  it('the web app address of the deck', () => expect(deckIdFromLink(`https://simple-bible-memory.web.app/app#/discover/${id}`)).toBe(id));
  it('a link the app made round-trips', () => expect(deckIdFromLink(deckShareUrl('a b'))).toBeNull()); // spaces are not part of an id
  it('anything else opens nothing', () => {
    for (const link of ['', 'not a link', 'simplebiblememory://settings', 'simplebiblememory://discover/', 'https://example.com/d/abc', 'https://simple-bible-memory.web.app/privacy-policy', 'javascript:alert(1)', `simplebiblememory://discover/${'x'.repeat(200)}`]) {
      expect(deckIdFromLink(link), link).toBeNull();
    }
  });
});

describe('hosting', () => {
  it('sends /d/<id> to the share page', () => {
    const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;
    expect(hosting.rewrites).toContainEqual({ source: '/d/**', destination: '/deck-link.html' });
  });
});
