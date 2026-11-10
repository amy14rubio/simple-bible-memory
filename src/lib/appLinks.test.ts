import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SITE_URL } from './site';

const host = new URL(SITE_URL).host;

describe('shared deck links that open the app directly (Universal Links and App Links)', () => {
  it('the website tells Apple which app opens /d/*', () => {
    const file = JSON.parse(readFileSync('public/.well-known/apple-app-site-association', 'utf8'));
    const detail = file.applinks.details[0];
    expect(detail.appIDs).toEqual(['UCZ2CMX8NG.app.simplebiblememory']); // Team ID + bundle ID
    expect(detail.components).toEqual([expect.objectContaining({ '/': '/d/*' })]);
  });

  it('the website tells Android which app and signing key open the links (the key Google Play signs the app with, not the upload key)', () => {
    const [entry] = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
    expect(entry.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(entry.target).toMatchObject({ namespace: 'android_app', package_name: 'app.simplebiblememory' });
    expect(entry.target.sha256_cert_fingerprints).toEqual(['F9:1A:D9:1F:42:8D:BE:9E:EA:FD:EB:57:2C:A8:A5:8D:24:5C:BB:7A:88:5E:70:C0:25:25:32:C9:3C:51:D1:5B']);
  });

  it('the iPhone app claims the website', () => {
    expect(readFileSync('ios/App/App/App.entitlements', 'utf8')).toContain(`<string>applinks:${host}</string>`);
  });

  it('hosting serves that file (dot-folders are not left out) as JSON', () => {
    const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;
    expect(hosting.ignore.some((p: string) => p === '**/.*' || p.includes('.well-known'))).toBe(false);
    expect(hosting.headers).toContainEqual({ source: '/.well-known/apple-app-site-association', headers: [{ key: 'Content-Type', value: 'application/json' }] });
  });

  it('the Android app asks to be verified for the same website and path', () => {
    const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain(`android:host="${host}"`);
    expect(manifest).toContain('android:pathPrefix="/d/"');
  });
});

describe('the picture and text chat apps show for a pasted link', () => {
  for (const page of ['public/deck-link.html', 'public/landing.html', 'public/es/landing.html']) {
    it(`${page} has a title, a description and a big picture`, () => {
      const html = readFileSync(page, 'utf8');
      for (const tag of ['og:title', 'og:description', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) expect(html, tag).toContain(`property="${tag}"`);
      expect(html).toContain(`<meta property="og:image" content="${SITE_URL}/og-image.jpg">`); // a full address, as chat apps need
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
    });
  }
  it('the picture exists and is small enough for chat apps (under 300 KB)', () => {
    expect(existsSync('public/og-image.jpg')).toBe(true);
    expect(readFileSync('public/og-image.jpg').length).toBeLessThan(300_000);
  });
});
