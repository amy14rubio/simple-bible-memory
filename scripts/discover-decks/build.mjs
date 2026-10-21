// Builds the discover decks (English: World English Bible; Spanish: Reina-Valera 1909) as importable deck files.
//   node scripts/discover-decks/build.mjs <folder with the WEB USFM files> <folder with the RV1909 USFM files> <output folder>
// The USFM files come from https://ebible.org/Scriptures/engwebp_usfm.zip and https://ebible.org/Scriptures/spaRV1909_usfm.zip.
// The text is copied from those files exactly as written (only the markup is removed). Nothing is translated or shortened.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [webDir, rvDir, outDir] = process.argv.slice(2);
if (!webDir || !rvDir || !outDir) { console.error('usage: build.mjs <webDir> <rvDir> <outDir>'); process.exit(1); }
const spec = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'spec.json'), 'utf8'));

// English book name (as the app writes it) -> USFM code, and the Spanish name the app uses (src/i18n/books.es.ts).
const BOOKS = {
  Philippians: ['PHP', 'Filipenses'], John: ['JHN', 'Juan'], Psalm: ['PSA', 'Salmos'], Isaiah: ['ISA', 'Isaías'], Matthew: ['MAT', 'Mateo'],
  '2 Timothy': ['2TI', '2 Timoteo'], Nahum: ['NAM', 'Nahúm'], Jeremiah: ['JER', 'Jeremías'], '1 Chronicles': ['1CH', '1 Crónicas'],
  Proverbs: ['PRO', 'Proverbios'], Mark: ['MRK', 'Marcos'], Joshua: ['JOS', 'Josué'], Romans: ['ROM', 'Romanos'], '2 Corinthians': ['2CO', '2 Corintios'],
  '1 Corinthians': ['1CO', '1 Corintios'], Ephesians: ['EPH', 'Efesios'], Colossians: ['COL', 'Colosenses'], Ecclesiastes: ['ECC', 'Eclesiastés'],
  '1 Peter': ['1PE', '1 Pedro'], '1 Thessalonians': ['1TH', '1 Tesalonicenses'], Nehemiah: ['NEH', 'Nehemías'], James: ['JAS', 'Santiago'],
  Acts: ['ACT', 'Hechos'], '1 John': ['1JN', '1 Juan'], Micah: ['MIC', 'Miqueas'],
};

/** USFM text -> { chapter: { verse: text } }. Footnotes, cross-references, Strong's numbers and markers are removed; the words are untouched. */
function parseBook(file) {
  let raw = readFileSync(file, 'utf8');
  raw = raw.replace(/\\f\s.*?\\f\*/gs, '').replace(/\\x\s.*?\\x\*/gs, '').replace(/\\fig\s.*?\\fig\*/gs, '');
  const chapters = {};
  let chapter = 0;
  let current = null; // the verse numbers the text is being added to
  const add = (text) => { if (current) for (const v of current) chapters[chapter][v] = `${chapters[chapter][v] ?? ''} ${text}`; };
  const clean = (s) => s
    .replace(/\|[^\\|]*(?=\\)/g, '')            // attributes such as |strong="G1"
    .replace(/\\\+?[a-z]+\d*\*/gi, '')           // closing markers  \w*  \add*  \nd*
    .replace(/\\\+?[a-z]+\d*\s?/gi, '')          // opening markers  \w   \add   \nd   \q1
    .replace(/\s+/g, ' ').trim();
  for (const line of raw.split('\n')) {
    const c = line.match(/^\\c\s+(\d+)/);
    if (c) { chapter = Number(c[1]); chapters[chapter] = {}; current = null; continue; }
    if (!chapter) continue;
    if (/^\\(s\d?|ms\d?|mr|r|d|sp|cl|cd|b|h|toc\d|mt\d?|id|ide|rem|periph|qa|qd)\b/.test(line)) { if (!/^\\(b)\b/.test(line)) current = null; continue; }
    const parts = line.split(/\\v\s+(\d+(?:-\d+)?)\s*/);
    if (parts.length === 1) { add(clean(line)); continue; }
    add(clean(parts[0]));
    for (let i = 1; i < parts.length; i += 2) {
      const [a, b] = parts[i].split('-').map(Number);
      current = Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k);
      for (const v of current) chapters[chapter][v] ??= '';
      add(clean(parts[i + 1] ?? ''));
    }
  }
  for (const ch of Object.values(chapters)) for (const v of Object.keys(ch)) ch[v] = ch[v].replace(/\s+/g, ' ').trim();
  return chapters;
}

const cache = new Map();
function book(dir, code) {
  const key = `${dir}/${code}`;
  if (!cache.has(key)) {
    const file = readdirSync(dir).find((f) => new RegExp(`^\\d+-${code}`).test(f) && f.endsWith('.usfm'));
    if (!file) throw new Error(`no file for ${code} in ${dir}`);
    cache.set(key, parseBook(join(dir, file)));
  }
  return cache.get(key);
}

const problems = [];
const report = [];

/**
 * The RV1909 file runs Psalm titles into verse 1 ("Salmo de David. JEHOVÁ es mi pastor") and has Hebrew-letter headings inside
 * Psalm 119 ("NUN."). Those are headings, not verse text, and the English WEB has none, so they are taken out. The old small
 * capitals that begin a verse ("LA blanda respuesta") are written in normal capitals. No word is changed.
 */
const TITLE = /^(Salmo de [^.]+\.|Cántico gradual(: de David)?\.|Al Músico principal: [^.]+\.)\s*/;
const HEBREW_LETTER = /(^|\s)(ALEPH|ALEF|BETH|GIMEL|DALETH|HE|VAU|ZAIN|HETH|TETH|JOD|CAPH|LAMED|MEM|NUN|SAMECH|AIN|PE|TSADE|TZADDI|KOPH|RESH|SIN|SCHIN|TAU)\.\s+/;
function tidySpanish(ref, text) {
  let out = text;
  const title = out.match(TITLE);
  if (title) { report.push(`${ref}: removed title "${title[0].trim()}"`); out = out.replace(TITLE, ''); }
  const letter = out.match(HEBREW_LETTER);
  if (letter) { report.push(`${ref}: removed heading "${letter[2]}."`); out = out.replace(HEBREW_LETTER, ' '); }
  const caps = out.match(/^([¡¿]?)([A-ZÁÉÍÓÚÑÜ]{2,})(?=[\s,;:.!?])/);
  if (caps) {
    const fixed = caps[2][0] + caps[2].slice(1).toLowerCase();
    report.push(`${ref}: capitals "${caps[2]}" -> "${fixed}"`);
    out = out.replace(caps[0], caps[1] + fixed);
  }
  return out.trim();
}
function passage(dir, ref, spanish) {
  const m = ref.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error(`bad reference ${ref}`);
  const [, name, ch, from, to] = m;
  const [code, es] = BOOKS[name] ?? [];
  if (!code) throw new Error(`unknown book ${name}`);
  const chapter = book(dir, code)[Number(ch)];
  const verses = [];
  for (let v = Number(from); v <= Number(to ?? from); v++) {
    const t = chapter?.[v];
    if (!t) { problems.push(`${spanish ? 'RV1909' : 'WEB'} ${ref}: verse ${v} not found or empty`); continue; }
    verses.push(t);
  }
  const reference = `${spanish ? es : name} ${ch}:${from}${to ? `-${to}` : ''}`;
  const joined = verses.join(' ');
  return { reference, verseText: spanish ? tidySpanish(reference, joined) : joined, note: null };
}

const description = {
  en: (topic) => `A collection of Bible passages about ${topic}, for personal study and memorization. World English Bible.`,
  es: (topic) => `Una colección de pasajes bíblicos sobre ${topic}, para el estudio personal y la memorización. Reina-Valera 1909.`,
};
const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
mkdirSync(outDir, { recursive: true });
const exportedAt = new Date().toISOString();
const summary = [];
spec.decks.forEach((d, i) => {
  for (const lang of ['en', 'es']) {
    const deck = {
      title: d[lang].title,
      description: description[lang](d[lang].topic),
      bibleLanguage: lang,
      translationCode: lang === 'en' ? 'WEB' : 'RV1909',
      cards: d.passages.map((p) => passage(lang === 'en' ? webDir : rvDir, p, lang === 'es')),
    };
    const name = `${String(i + 1).padStart(2, '0')}-${slug(deck.title)}-${lang}-${lang === 'en' ? 'web' : 'rv1909'}.json`;
    writeFileSync(join(outDir, name), JSON.stringify({ app: 'simple-bible-memory', format: 1, exportedAt, includesProgress: false, decks: [deck] }, null, 2) + '\n');
    summary.push(`${name}: ${deck.cards.length} cards`);
  }
});
console.log(summary.join('\n'));
console.log('\nSpanish clean-up:\n' + report.join('\n'));
if (problems.length) { console.error('PROBLEMS:\n' + problems.join('\n')); process.exit(2); }
