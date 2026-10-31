/**
 * Refreshes the two lists that are part of the app, so no device ever has to ask YouVersion for them (the platform allows this
 * app only a few hundred requests an hour in all):
 *   src/domain/bible/catalogue.json      every translation the platform offers (without Biblica's and The Passion Translation)
 *   src/domain/bible/languageNames.json  the name of each language, in English (and Spanish where YouVersion has it)
 *
 *   node scripts/make-translation-data.mjs      (needs VITE_YOUVERSION_APP_KEY in .env.local)
 *
 * Gentle on the platform: one request a second, and it stops at once if it is told to slow down. The catalogue is about 15
 * requests. A language without a name in languageNames.json is looked up too (one request each, so only run this when new languages
 * have appeared; the file keeps what it has). Any language still without a name is shown by the picker as "Language (xyz)".
 * Names for languages YouVersion does not describe can be added by hand to languageNames.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const key = /^VITE_YOUVERSION_APP_KEY=(.+)$/m.exec(readFileSync(path.join(ROOT, '.env.local'), 'utf8'))?.[1]?.trim();
if (!key) throw new Error('VITE_YOUVERSION_APP_KEY is not in .env.local');
const BASE = 'https://api.youversion.com/v1';
const BIBLICA = '05a9aa40-37b6-4e34-b9f1-a443fa4b1fff'; // keep in step with BIBLICA_ORGANIZATION in src/domain/bible/sources.ts
const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function get(url) {
  await wait(1000);
  const r = await fetch(BASE + url, { headers: { 'X-YVP-App-Key': key } });
  if (r.status === 429) throw new Error('The platform says to slow down (429): stopped. Wait an hour and run it again.');
  return r.ok ? r.json() : null;
}

// The catalogue.
const rows = [];
let token = '';
do {
  const r = await get(`/bibles?language_ranges[]=*&page_size=99${token ? `&page_token=${encodeURIComponent(token)}` : ''}`);
  if (!r) throw new Error('Could not read the list of translations.');
  for (const b of r.data) {
    if (b.organization_id === BIBLICA || /passion translation/i.test(b.title) || /^tpt$/i.test(b.abbreviation ?? '')) continue;
    rows.push([b.id, b.abbreviation ?? '', b.title, b.language_tag]);
  }
  token = r.next_page_token ?? '';
} while (token);
rows.sort((a, b) => a[2].localeCompare(b[2]));
writeFileSync(path.join(ROOT, 'src/domain/bible/catalogue.json'), JSON.stringify(rows));
console.log(`${rows.length} translations`);

// The language names.
const FILE = path.join(ROOT, 'src/domain/bible/languageNames.json');
const names = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
const missing = [...new Set(rows.map((r) => r[3].split('-')[0].toLowerCase()))].filter((c) => !names[c]);
console.log(`${missing.length} languages without a name`);
try {
  for (const code of missing) {
    const l = await get(`/languages/${code}`);
    const en = l?.display_names?.en ?? l?.localized_name;
    if (en) names[code] = [en, l?.display_names?.es ?? en].filter((n, i, a) => i === 0 || n !== a[0]);
    writeFileSync(FILE, JSON.stringify(Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b))))); // saved as it goes
  }
} catch (e) {
  console.warn(String(e.message));
}
