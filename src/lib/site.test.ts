import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONTACT_EMAIL } from '../features/discover/contact';
import { legalUrl, type LegalPage } from './site';

const PAGES: LegalPage[] = ['privacy-policy', 'terms', 'delete-account'];
const read = (lang: 'en' | 'es', page: LegalPage) => readFileSync(`public/${lang === 'es' ? 'es/' : ''}${page}.html`, 'utf8');

describe('links to the website pages', () => {
  it('English at the top level, Spanish under /es', () => {
    expect(legalUrl('privacy-policy', 'en')).toBe('https://simple-bible-memory.web.app/privacy-policy');
    expect(legalUrl('terms', 'es')).toBe('https://simple-bible-memory.web.app/es/terms');
    expect(legalUrl('delete-account', 'en')).toBe('https://simple-bible-memory.web.app/delete-account');
  });
});

describe('the website pages (public/)', () => {
  for (const page of PAGES) {
    for (const lang of ['en', 'es'] as const) {
      it(`${lang}/${page} exists, says its language, and links to the other language and to the contact email`, () => {
        const html = read(lang, page);
        expect(html).toContain(`<html lang="${lang}">`);
        expect(html).toContain(`mailto:${CONTACT_EMAIL}`);
        expect(html).toContain(lang === 'en' ? `href="/es/${page}"` : `href="/${page}"`); // the way to the other language
        expect(html).toContain('<link rel="stylesheet" href="/legal.css">');
        expect(html).not.toMatch(/<script/i); // plain pages: no scripts
      });
    }
  }

  it('the Spanish pages have the same sections as the English ones', () => {
    for (const page of PAGES) {
      const count = (html: string) => (html.match(/<h2>/g) ?? []).length;
      expect(count(read('es', page)), page).toBe(count(read('en', page)));
    }
  });

  it('the privacy policy keeps its promises about what the app does (analytics, backup, children)', () => {
    const en = read('en', 'privacy-policy');
    expect(en).toMatch(/no analytics/i);
    expect(en).toMatch(/does not use Android's automatic cloud backup/);
    expect(en).toMatch(/under 13/);
    const es = read('es', 'privacy-policy');
    expect(es).toMatch(/no tiene analítica/);
    expect(es).toMatch(/no usa la copia de seguridad automática/);
    expect(es).toMatch(/menores de 13/);
  });
});
