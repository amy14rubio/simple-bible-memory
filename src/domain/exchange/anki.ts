/**
 * Reads Anki's "Notes in Plain Text" export: one note per line, fields separated by a tab (or a comma, semicolon, pipe or
 * space, as the file's header says), with fields that contain the separator or line breaks wrapped in double quotes.
 * Lines starting with # are settings, such as `#separator:tab`, `#html:true` and `#columns:Front<tab>Back<tab>Tags`.
 */
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
  const clean = (f: string) => (html ? stripHtml(f) : f.trim());
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
}

export function mapAnkiRows(rows: string[][], m: ColumnMapping): MappedCards {
  const cards: MappedCards['cards'] = [];
  let skipped = 0;
  for (const row of m.skipFirstRow ? rows.slice(1) : rows) {
    const reference = (row[m.verse] ?? '').trim();
    const verseText = (row[m.passage] ?? '').trim();
    if (!reference || !verseText) { skipped++; continue; }
    cards.push({ reference, verseText, note: m.source === null ? null : (row[m.source] ?? '').trim() || null });
  }
  return { cards, skipped };
}
