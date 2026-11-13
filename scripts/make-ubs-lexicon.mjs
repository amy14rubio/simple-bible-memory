// Builds the Spanish word-study dictionaries from the United Bible Societies' open data (CC BY-SA 4.0):
//   node scripts/make-ubs-lexicon.mjs greek      -> web-data/ubs-es/greek.json   (UBS Dictionary of the Greek New Testament, Spanish)
//   node scripts/make-ubs-lexicon.mjs hebrew     -> web-data/ubs-es/hebrew.json  (UBS Dictionary of Biblical Hebrew, Spanish; the senses the UBS has NOT flagged as AI-generated)
// Source: https://github.com/ubsicap/ubs-open-license (dictionaries/). The files are fetched fresh from a pinned commit, never kept in the repository.
// What is kept: the lemma, the Strong's numbers, and for each sense its glosses, short definition and comment, plus the entry's footnotes. Nothing is
// reworded. Changes made (listed in web-data/ubs-es/README.md): only the UBS's own markup is turned into plain text.
import { mkdirSync, writeFileSync } from 'node:fs';

const COMMIT = '099f4dcd0e4f7c412d0cdf9b1b41d50365143197';
const RAW = `https://raw.githubusercontent.com/ubsicap/ubs-open-license/${COMMIT}/dictionaries`;
const SOURCES = {
  greek: { url: `${RAW}/greek/JSON/UBSGreekNTDic-v1.0-es.JSON`, prefix: 'G', firstBook: 40, name: 'UBS Dictionary of the Greek New Testament (Spanish, v1.0)' },
  hebrew: { url: `${RAW}/hebrew/JSON/UBSHebrewDic-v0.9.4-es.JSON`, prefix: 'H', firstBook: 1, name: 'UBS Dictionary of Biblical Hebrew (Spanish, v0.9.4)' },
};
// Spanish book abbreviations, in the numbering the UBS data uses (Genesis = 1 ... Revelation = 66).
const BOOKS = ['Gn', 'Éx', 'Lv', 'Nm', 'Dt', 'Jos', 'Jue', 'Rt', '1S', '2S', '1R', '2R', '1Cr', '2Cr', 'Esd', 'Neh', 'Est', 'Job', 'Sal', 'Pr', 'Ec', 'Cnt', 'Is', 'Jer', 'Lm', 'Ez', 'Dn', 'Os', 'Jl', 'Am', 'Abd', 'Jon', 'Miq', 'Nah', 'Hab', 'Sof', 'Hag', 'Zac', 'Mal',
  'Mt', 'Mr', 'Lc', 'Jn', 'Hch', 'Ro', '1Co', '2Co', 'Gá', 'Ef', 'Fil', 'Col', '1Ts', '2Ts', '1Ti', '2Ti', 'Tit', 'Flm', 'He', 'Stg', '1P', '2P', '1Jn', '2Jn', '3Jn', 'Jud', 'Ap'];

const reference = (code) => { // BBBCCCVVVSSWWW -> "Col 2:18"
  const book = Number(code.slice(0, 3)), chapter = Number(code.slice(3, 6)), verse = Number(code.slice(6, 9));
  return `${BOOKS[book - 1] ?? '?'} ${chapter}:${verse}`;
};

/** {S:code code ...}: one or several verses (the same verse is named once). */
const references = (codes) => [...new Set(codes.trim().split(/\s+/).map(span))].join(', ');
/** One code, or two joined by a hyphen (a stretch of verses: "He 5:11-6:12"). */
function span(token) {
  const [a, b] = token.split('-');
  if (!b) return reference(a);
  const from = reference(a), to = reference(b);
  if (from === to) return from;
  const [book1, rest1] = from.split(' '), [book2, rest2] = to.split(' ');
  if (book1 !== book2) return `${from}-${to}`;
  const [c1] = rest1.split(':'), [c2, v2] = rest2.split(':');
  return c1 === c2 ? `${from}-${v2}` : `${from}-${rest2}`;
}

/** The UBS's markup as plain text: {L:word<...>} a link to another entry, {S:...} a verse, {D:93.32} a domain number, {N:001} a footnote mark. */
function clean(text) {
  return (text ?? '')
    .replace(/\{L:([^<}]*)<[^}]*\}/g, '$1')
    .replace(/(\p{L})?\{S:([\d \-]+)\}/gu, (_, before, codes) => (before ? `${before} ` : '') + references(codes))
    .replace(/(\p{L})?\bS:(\d{14}(?: \d{14})*)/gu, (_, before, codes) => (before ? `${before} ` : '') + references(codes))
    .replace(/\{D:([\d.]+)\}/g, '$1')
    .replace(/\bD:([\d.]+)/g, '$1')
    .replace(/\{N:0*(\d+)\}/g, '[$1]')
    .replace(/\{A:([^}]*)\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const kind = process.argv[2];
const source = SOURCES[kind];
if (!source) { console.error('usage: node scripts/make-ubs-lexicon.mjs greek|hebrew'); process.exit(1); }

console.log(`fetching ${source.name} ...`);
const data = await (await fetch(source.url)).json();
const entries = {};
const stats = { entries: data.length, noStrongs: 0, sensesKept: 0, sensesDroppedAI: 0, entriesEmpty: 0 };

for (const entry of data) {
  const codes = (entry.StrongCodes ?? []).filter((c) => c.startsWith(source.prefix));
  if (codes.length === 0) { stats.noStrongs += 1; continue; }
  const senses = [];
  for (const form of entry.BaseForms ?? []) for (const meaning of form.LEXMeanings ?? []) for (const s of meaning.LEXSenses ?? []) {
    if (s.AIGenerated) { stats.sensesDroppedAI += 1; continue; } // the UBS flags these as machine-generated: not used
    const glosses = (s.Glosses ?? []).map(clean).filter(Boolean);
    const definition = clean(s.DefinitionShort) || clean(s.DefinitionLong);
    const comment = clean(s.Comments);
    if (!definition && glosses.length === 0) continue;
    senses.push({ ...(glosses.length ? { g: glosses } : {}), ...(definition ? { d: definition } : {}), ...(comment ? { c: comment } : {}) });
  }
  if (senses.length === 0) { stats.entriesEmpty += 1; continue; }
  stats.sensesKept += senses.length;
  const notes = (entry.Notes ?? []).filter((n) => !n.AIGenerated).map((n) => clean(n.Content)).filter(Boolean);
  for (const code of codes) entries[code] = { l: entry.Lemma, s: senses, ...(notes.length ? { n: notes } : {}) };
}

// The UBS sometimes numbers a word "G0518a" where the interlinear (and Strong) say G0518. When the plain number has no entry of its own and there is
// exactly one lettered variant, the variant is also reachable under the plain number; with several variants it is ambiguous and is left alone.
const variants = {};
for (const code of Object.keys(entries)) {
  const m = /^([GH]\d{4})[a-z]$/.exec(code);
  if (m) (variants[m[1]] ??= []).push(code);
}
let aliased = 0;
for (const [plain, list] of Object.entries(variants)) {
  if (!entries[plain] && list.length === 1) { entries[plain] = entries[list[0]]; aliased += 1; }
}
stats.aliasedToPlainNumber = aliased;

mkdirSync('web-data/ubs-es', { recursive: true });
const out = { source: source.name, license: 'CC BY-SA 4.0', entries };
writeFileSync(`web-data/ubs-es/${kind}.json`, JSON.stringify(out));
console.log(kind, { ...stats, strongsNumbers: Object.keys(entries).length });
