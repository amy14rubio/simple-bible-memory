/**
 * Reads Anki's "Notes in Plain Text" export: one note per line, fields separated by a tab (or a comma, semicolon, pipe or
 * space, as the file's header says), with fields that contain the separator or line breaks wrapped in double quotes.
 * Lines starting with # are settings, such as `#separator:tab`, `#html:true` and `#columns:Front<tab>Back<tab>Tags`.
 */
import { isBibleReference } from '../bible/reference';

/**
 * Anki (and the apps it is copied from) sometimes leave invisible text-direction marks and zero-width spaces around a field, for example in front
 * of a reference written in a right-to-left or mixed text. They show nothing, but they stop "Salmos 56:3-4" from being recognised as a reference
 * and are saved with it. (Joiners that some scripts need, U+200C and U+200D, are kept.)
 */
const INVISIBLE = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export interface AnkiTable {
  /** Column names from the file's `#columns:` line, when it has one. */
  columns: string[] | null;
  rows: string[][];
}

const SEPARATORS: Record<string, string> = { tab: '\t', comma: ',', semicolon: ';', pipe: '|', space: ' ' };

function readHeaders(lines: string[]): { settings: Record<string, string>; bodyStart: number } {
  const settings: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.startsWith('#')) break;
    const colon = line.indexOf(':');
    if (colon > 0) settings[line.slice(1, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { settings, bodyStart: i };
}

/** Splits text into rows of fields, honouring quotes: "a ""quoted"" word" and fields that span several lines. */
export function splitDelimited(body: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false; // has this field got anything (including an opening quote)?
  const endField = () => { row.push(field); field = ''; started = false; };
  const endRow = () => { endField(); if (row.some((f) => f.trim() !== '')) rows.push(row); row = []; };

  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && !started) {
      quoted = true;
      started = true;
    } else if (ch === separator) {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
      started = true;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

/** Anki fields are often HTML: line breaks become new lines, other tags are dropped, common entities are decoded. */
export function stripHtml(value: string): string {
  return value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(div|p|li)\s*>\s*<\s*(div|p|li)\b[^>]*>/gi, '\n') // one block right after another: one line break
    .replace(/<\s*(div|p|li)\b[^>]*>/gi, '\n')
    .replace(/<\/\s*(div|p|li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#?\w+);/g, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseAnkiText(source: string): AnkiTable {
  const text = source.replace(/^﻿/, '');
  const lines = text.split(/\r\n|\r|\n/);
  const { settings, bodyStart } = readHeaders(lines);
  const body = lines.slice(bodyStart).join('\n');

  let separator = SEPARATORS[(settings.separator ?? '').toLowerCase()];
  if (!separator) {
    // No header: a line with a tab is tab-separated; otherwise guess comma or semicolon from the first line.
    const first = body.split('\n').find((l) => l.trim()) ?? '';
    separator = first.includes('\t') ? '\t' : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  }
  const html = settings.html ? settings.html.toLowerCase() === 'true' : /<\w+[^>]*>/.test(body);
  const clean = (f: string) => { const x = f.replace(INVISIBLE, ''); return html ? stripHtml(x) : x.trim(); };
  const rows = splitDelimited(body, separator).map((r) => r.map(clean));
  const columns = settings.columns ? settings.columns.split(separator).map((c) => c.trim()) : null;
  return { columns, rows };
}

export interface ColumnMapping {
  verse: number;
  passage: number;
  source: number | null;
  /** The first row holds column names, not a card. */
  skipFirstRow: boolean;
}

export interface MappedCards {
  cards: { reference: string; verseText: string; note: string | null }[];
  /** Rows left out because the verse or the passage was empty. */
  skipped: number;
  /** Rows that had the verse and the passage the other way round and were put right. */
  swapped: number;
}

/**
 * Turns the rows into cards, taking the verse and the passage from the chosen columns. A file exported from Anki sometimes has a row with the two the
 * other way round (the passage in the verse column and the verse reference in the passage column). A row where ONLY the passage column holds something
 * that is a Bible reference is put right, so the reference is the verse and the text is the passage. This is done only when most rows follow the chosen
 * columns: if the columns look chosen the wrong way round for the whole file, they are left exactly as chosen (that is the person's decision).
 */
export function mapAnkiRows(rows: string[][], m: ColumnMapping): MappedCards {
  const body = m.skipFirstRow ? rows.slice(1) : rows;
  const cell = (row: string[], i: number) => (row[i] ?? '').trim();
  let asChosen = 0;
  let reversed = 0;
  for (const row of body) {
    const verseIsRef = isBibleReference(cell(row, m.verse));
    const passageIsRef = isBibleReference(cell(row, m.passage));
    if (verseIsRef && !passageIsRef) asChosen++;
    else if (passageIsRef && !verseIsRef) reversed++;
  }
  const fixRows = reversed > 0 && asChosen > reversed;

  const cards: MappedCards['cards'] = [];
  let skipped = 0;
  let swapped = 0;
  for (const row of body) {
    let reference = cell(row, m.verse);
    let verseText = cell(row, m.passage);
    if (!reference || !verseText) { skipped++; continue; }
    if (fixRows && !isBibleReference(reference) && isBibleReference(verseText)) { [reference, verseText] = [verseText, reference]; swapped++; }
    cards.push({ reference, verseText, note: m.source === null ? null : cell(row, m.source) || null });
  }
  return { cards, skipped, swapped };
}
