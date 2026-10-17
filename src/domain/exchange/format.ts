/**
 * The deck file: what "Export deck" writes and "Import deck" reads. A plain JSON file with a version number, so a
 * future version of the app can still read old files (and refuse, politely, files made by a newer one).
 * Importing never trusts a file: every field is checked, sizes are capped, and anything odd is rejected as a whole.
 */
export const APP_ID = 'simple-bible-memory';
export const FORMAT_VERSION = 1;

export const LIMITS = {
  decks: 200,
  cardsPerDeck: 5_000,
  cardsTotal: 20_000,
  reviewsPerCard: 5_000,
  title: 200,
  description: 2_000,
  reference: 200,
  verseText: 20_000,
  note: 500,
  translationCode: 40,
  language: 20,
  fileBytes: 50 * 1024 * 1024,
} as const;

export type CardKind = 'recall' | 'identify';
export type StudyMode = 'flashcard' | 'type' | 'blanks';

export interface ExportedSchedule {
  kind: CardKind;
  due: number;
  stability: number;
  difficulty: number;
  state: 0 | 1 | 2 | 3;
  reps: number;
  lapses: number;
  learningSteps: number;
  scheduledDays: number;
  lastReview: number | null;
}

export interface ExportedReview {
  kind: CardKind;
  reviewedAt: number;
  rating: 1 | 2 | 3 | 4;
  studyMode: StudyMode;
  stateBefore: number;
  dueBefore: number;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  elapsedDays: number;
}

export interface ExportedCard {
  reference: string;
  verseText: string;
  note: string | null;
  /** Only when the file includes progress. */
  schedules?: ExportedSchedule[];
  reviews?: ExportedReview[];
}

export interface ExportedDeck {
  title: string;
  description: string | null;
  bibleLanguage: string | null;
  translationCode: string | null;
  cards: ExportedCard[];
}

export interface ExportFile {
  app: typeof APP_ID;
  format: number;
  exportedAt: string;
  includesProgress: boolean;
  decks: ExportedDeck[];
}

export type ParseErrorCode = 'too-big' | 'not-json' | 'not-ours' | 'newer' | 'invalid' | 'empty';
export type ParseResult = { ok: true; file: ExportFile } | { ok: false; code: ParseErrorCode; /** Where the problem is, for example "decks[0].cards[3].reference". */ where?: string };

export function buildExportFile(decks: ExportedDeck[], includesProgress: boolean, now: Date = new Date()): ExportFile {
  return { app: APP_ID, format: FORMAT_VERSION, exportedAt: now.toISOString(), includesProgress, decks };
}

class Invalid extends Error {
  where: string;
  constructor(where: string) { super(where); this.where = where; }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(v: unknown, where: string, max: number, required: boolean): string {
  if (typeof v !== 'string') throw new Invalid(where);
  const t = v.trim();
  if ((required && !t) || t.length > max) throw new Invalid(where);
  return t;
}
function optionalText(v: unknown, where: string, max: number): string | null {
  if (v === null || v === undefined) return null;
  const t = text(v, where, max, false);
  return t || null;
}
function num(v: unknown, where: string, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) throw new Invalid(where);
  return v;
}
const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], where: string): T => {
  if (!allowed.includes(v as T)) throw new Invalid(where);
  return v as T;
};
const list = (v: unknown, where: string, max: number): unknown[] => {
  if (!Array.isArray(v) || v.length > max) throw new Invalid(where);
  return v;
};

const TIME = { max: 8.64e15, integer: true } as const; // the range JavaScript dates can hold

function schedule(v: unknown, where: string): ExportedSchedule {
  if (!isObject(v)) throw new Invalid(where);
  return {
    kind: oneOf(v.kind, ['recall', 'identify'] as const, `${where}.kind`),
    due: num(v.due, `${where}.due`, TIME),
    stability: num(v.stability, `${where}.stability`, { max: 1e6 }),
    difficulty: num(v.difficulty, `${where}.difficulty`, { max: 100 }),
    state: oneOf(v.state, [0, 1, 2, 3] as const, `${where}.state`),
    reps: num(v.reps, `${where}.reps`, { max: 1e6, integer: true }),
    lapses: num(v.lapses, `${where}.lapses`, { max: 1e6, integer: true }),
    learningSteps: num(v.learningSteps, `${where}.learningSteps`, { max: 100, integer: true }),
    scheduledDays: num(v.scheduledDays, `${where}.scheduledDays`, { max: 1e5, integer: true }),
    lastReview: v.lastReview === null ? null : num(v.lastReview, `${where}.lastReview`, TIME),
  };
}

function review(v: unknown, where: string): ExportedReview {
  if (!isObject(v)) throw new Invalid(where);
  return {
    kind: oneOf(v.kind, ['recall', 'identify'] as const, `${where}.kind`),
    reviewedAt: num(v.reviewedAt, `${where}.reviewedAt`, TIME),
    rating: oneOf(v.rating, [1, 2, 3, 4] as const, `${where}.rating`),
    studyMode: oneOf(v.studyMode, ['flashcard', 'type', 'blanks'] as const, `${where}.studyMode`),
    stateBefore: num(v.stateBefore, `${where}.stateBefore`, { max: 3, integer: true }),
    dueBefore: num(v.dueBefore, `${where}.dueBefore`, TIME),
    stability: num(v.stability, `${where}.stability`, { max: 1e6 }),
    difficulty: num(v.difficulty, `${where}.difficulty`, { max: 100 }),
    scheduledDays: num(v.scheduledDays, `${where}.scheduledDays`, { max: 1e5, integer: true }),
    elapsedDays: num(v.elapsedDays, `${where}.elapsedDays`, { max: 1e5, integer: true }),
  };
}

function card(v: unknown, where: string): ExportedCard {
  if (!isObject(v)) throw new Invalid(where);
  const out: ExportedCard = {
    reference: text(v.reference, `${where}.reference`, LIMITS.reference, true),
    verseText: text(v.verseText, `${where}.verseText`, LIMITS.verseText, true),
    note: optionalText(v.note, `${where}.note`, LIMITS.note),
  };
  if (v.schedules !== undefined) {
    out.schedules = list(v.schedules, `${where}.schedules`, 2).map((s, i) => schedule(s, `${where}.schedules[${i}]`));
    if (new Set(out.schedules.map((s) => s.kind)).size !== out.schedules.length) throw new Invalid(`${where}.schedules`);
  }
  if (v.reviews !== undefined) out.reviews = list(v.reviews, `${where}.reviews`, LIMITS.reviewsPerCard).map((r, i) => review(r, `${where}.reviews[${i}]`));
  return out;
}

/** Reads and checks the text of a deck file. Never throws: the answer says what is wrong and where. */
export function parseExportFile(source: string): ParseResult {
  if (source.length > LIMITS.fileBytes) return { ok: false, code: 'too-big' };
  let data: unknown;
  try { data = JSON.parse(source); } catch { return { ok: false, code: 'not-json' }; }
  if (!isObject(data) || data.app !== APP_ID) return { ok: false, code: 'not-ours' };
  if (typeof data.format !== 'number' || !Number.isInteger(data.format) || data.format < 1) return { ok: false, code: 'invalid', where: 'format' };
  if (data.format > FORMAT_VERSION) return { ok: false, code: 'newer' };

  try {
    const decks = list(data.decks, 'decks', LIMITS.decks).map((d, i): ExportedDeck => {
      const where = `decks[${i}]`;
      if (!isObject(d)) throw new Invalid(where);
      return {
        title: text(d.title, `${where}.title`, LIMITS.title, true),
        description: optionalText(d.description, `${where}.description`, LIMITS.description),
        bibleLanguage: optionalText(d.bibleLanguage, `${where}.bibleLanguage`, LIMITS.language),
        translationCode: optionalText(d.translationCode, `${where}.translationCode`, LIMITS.translationCode),
        cards: list(d.cards, `${where}.cards`, LIMITS.cardsPerDeck).map((c, j) => card(c, `${where}.cards[${j}]`)),
      };
    });
    if (decks.length === 0) return { ok: false, code: 'empty' };
    if (decks.reduce((n, d) => n + d.cards.length, 0) > LIMITS.cardsTotal) return { ok: false, code: 'too-big' };
    const includesProgress = data.includesProgress === true && decks.some((d) => d.cards.some((c) => c.schedules?.length || c.reviews?.length));
    const exportedAt = typeof data.exportedAt === 'string' ? data.exportedAt.slice(0, 40) : '';
    return { ok: true, file: { app: APP_ID, format: data.format, exportedAt, includesProgress, decks } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, code: 'invalid', where: e.where };
    throw e;
  }
}

/** A safe file name for a deck: letters, digits and dashes (any alphabet), never empty. */
export function exportFileName(titles: string[]): string {
  const base = titles.length === 1 ? titles[0]! : 'bible-memory-backup';
  const slug = base.normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'deck'}.json`;
}
