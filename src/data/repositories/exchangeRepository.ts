import type { Database, SqlValue } from '../database/Database';
import type { CardInput } from '../../domain/types';
import { buildExportFile, type ExportFile, type ExportedCard, type ExportedDeck, type ExportedReview, type ExportedSchedule } from '../../domain/exchange/format';
import { SCHEDULER_VERSION } from '../../domain/scheduling/scheduler';
import { isLicensed } from '../../domain/bible/sources';
import { requireText, optionalText, type Clock } from './util';

type Row = Record<string, SqlValue>;

export interface ImportResult {
  deckIds: string[];
  decks: number;
  cards: number;
}

export interface ExchangeRepository {
  /** Reads decks (all of them when `deckIds` is null) into the deck-file shape, with or without study progress. */
  exportDecks(deckIds: string[] | null, options: { progress: boolean }): Promise<ExportFile>;
  /** Adds every deck in the file as a NEW deck, in one all-or-nothing step. Progress is copied only when asked for and present. */
  importFile(file: ExportFile, options: { progress: boolean }): Promise<ImportResult>;
  /**
   * Adds one new deck holding these cards (used by the Anki import and by importing a public deck).
   * `importedFrom` is the id of the public deck it came from, if any.
   */
  importCards(
    deck: { title: string; description?: string | null; translationCode?: string | null; bibleLanguage?: string | null; importedFrom?: string },
    cards: CardInput[],
  ): Promise<ImportResult>;
  /** The local deck (if any) that was imported from this public deck. */
  findImported(publicDeckId: string): Promise<{ id: string; title: string } | undefined>;
}

const kindOf = (v: SqlValue | undefined) => (v === 'identify' ? 'identify' : 'recall');

export function createExchangeRepository(db: Database, now: Clock = Date.now): ExchangeRepository {
  async function readDeck(deck: Row, progress: boolean): Promise<ExportedDeck> {
    const deckId = deck.id as string;
    const cards = await db.query<Row>(
      `SELECT c.* FROM cards c JOIN deck_cards dc ON dc.card_id = c.id WHERE dc.deck_id = ? ORDER BY dc.added_at, c.created_at`,
      [deckId],
    );
    const exported = new Map<string, ExportedCard>();
    const ordered: ExportedCard[] = cards.map((c) => {
      // A licensed text never leaves the device: the file holds the reference and the translation, and whoever opens it fetches the text.
      const own = (c.translation_code as string | null) ?? null;
      const licensed = isLicensed(own);
      const e: ExportedCard = { reference: c.reference as string, verseText: licensed ? '' : (c.verse_text as string), note: (c.note as string | null) ?? null };
      if (own) e.translationCode = own;
      if (progress) { e.schedules = []; e.reviews = []; }
      exported.set(c.id as string, e);
      return e;
    });

    if (progress) {
      const schedules = await db.query<Row>(
        `SELECT s.* FROM card_schedule s JOIN deck_cards dc ON dc.card_id = s.card_id WHERE dc.deck_id = ? ORDER BY s.kind`,
        [deckId],
      );
      for (const s of schedules) {
        const schedule: ExportedSchedule = {
          kind: kindOf(s.kind), due: s.due as number, stability: s.stability as number, difficulty: s.difficulty as number,
          state: s.state as 0 | 1 | 2 | 3, reps: s.reps as number, lapses: s.lapses as number, learningSteps: s.learning_steps as number,
          scheduledDays: s.scheduled_days as number, lastReview: (s.last_review as number | null) ?? null,
        };
        exported.get(s.card_id as string)?.schedules?.push(schedule);
      }
      const logs = await db.query<Row>(
        `SELECT l.* FROM review_logs l JOIN deck_cards dc ON dc.card_id = l.card_id WHERE dc.deck_id = ? ORDER BY l.reviewed_at`,
        [deckId],
      );
      for (const l of logs) {
        const review: ExportedReview = {
          kind: kindOf(l.kind), reviewedAt: l.reviewed_at as number, rating: l.rating as 1 | 2 | 3 | 4, studyMode: l.study_mode as ExportedReview['studyMode'],
          stateBefore: l.state_before as number, dueBefore: l.due_before as number, stability: l.stability as number, difficulty: l.difficulty as number,
          scheduledDays: l.scheduled_days as number, elapsedDays: l.elapsed_days as number,
        };
        exported.get(l.card_id as string)?.reviews?.push(review);
      }
    }

    return {
      title: deck.title as string,
      description: (deck.description as string | null) ?? null,
      bibleLanguage: (deck.bible_language as string | null) ?? null,
      translationCode: (deck.translation_code as string | null) ?? null,
      cards: ordered,
    };
  }

  /** Inserts one deck with its cards inside a transaction; returns the new deck's id. */
  async function insertDeck(tx: Database, deck: ExportedDeck, withProgress: boolean, t: number, importedFrom: string | null = null): Promise<string> {
    const deckId = crypto.randomUUID();
    await tx.run(
      'INSERT INTO decks (id, title, description, bible_language, translation_code, imported_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [deckId, deck.title, deck.description, deck.bibleLanguage, deck.translationCode, importedFrom, t, t],
    );
    for (const [i, card] of deck.cards.entries()) {
      const cardId = crypto.randomUUID();
      await tx.run(
        'INSERT INTO cards (id, reference, verse_text, note, translation_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [cardId, card.reference, isLicensed(card.translationCode) ? '' : card.verseText, card.note, card.translationCode ?? null, t, t],
      );
      // One millisecond apart, so the cards stay in the order they came in.
      await tx.run('INSERT INTO deck_cards (deck_id, card_id, added_at) VALUES (?, ?, ?)', [deckId, cardId, t + i]);
      if (!withProgress) continue;
      for (const s of card.schedules ?? []) {
        await tx.run(
          `INSERT INTO card_schedule (card_id, kind, due, stability, difficulty, state, reps, lapses, learning_steps, scheduled_days, last_review, scheduler_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cardId, s.kind, s.due, s.stability, s.difficulty, s.state, s.reps, s.lapses, s.learningSteps, s.scheduledDays, s.lastReview, SCHEDULER_VERSION],
        );
      }
      for (const r of card.reviews ?? []) {
        await tx.run(
          `INSERT INTO review_logs (id, card_id, kind, reviewed_at, rating, study_mode, state_before, due_before, stability, difficulty, scheduled_days, elapsed_days)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), cardId, r.kind, r.reviewedAt, r.rating, r.studyMode, r.stateBefore, r.dueBefore, r.stability, r.difficulty, r.scheduledDays, r.elapsedDays],
        );
      }
    }
    return deckId;
  }

  return {
    async exportDecks(deckIds, { progress }) {
      const rows = deckIds === null
        ? await db.query<Row>('SELECT * FROM decks ORDER BY title COLLATE NOCASE')
        : (await Promise.all(deckIds.map((id) => db.query<Row>('SELECT * FROM decks WHERE id = ?', [id])))).flatMap((r) => r);
      const decks: ExportedDeck[] = [];
      for (const row of rows) decks.push(await readDeck(row, progress));
      return buildExportFile(decks, progress, new Date(now()));
    },

    async importFile(file, { progress }) {
      const withProgress = progress && file.includesProgress;
      const t = now();
      const deckIds = await db.transaction(async (tx) => {
        const ids: string[] = [];
        for (const deck of file.decks) ids.push(await insertDeck(tx, deck, withProgress, t));
        return ids;
      });
      return { deckIds, decks: deckIds.length, cards: file.decks.reduce((n, d) => n + d.cards.length, 0) };
    },

    async importCards(deck, cards) {
      const exported: ExportedDeck = {
        title: requireText(deck.title, 'Deck title', 'deck-title-required'),
        description: optionalText(deck.description),
        bibleLanguage: optionalText(deck.bibleLanguage),
        translationCode: optionalText(deck.translationCode),
        cards: cards.map((c) => ({
          reference: requireText(c.reference, 'Reference', 'reference-required'),
          verseText: isLicensed(c.translationCode) ? '' : requireText(c.verseText, 'Verse text', 'verse-text-required'),
          note: optionalText(c.note),
          ...(c.translationCode ? { translationCode: c.translationCode } : {}),
        })),
      };
      const id = await db.transaction((tx) => insertDeck(tx, exported, false, now(), deck.importedFrom ?? null));
      return { deckIds: [id], decks: 1, cards: exported.cards.length };
    },

    async findImported(publicDeckId) {
      const [r] = await db.query<Row>('SELECT id, title FROM decks WHERE imported_from = ? ORDER BY created_at LIMIT 1', [publicDeckId]);
      return r ? { id: r.id as string, title: r.title as string } : undefined;
    },
  };
}
