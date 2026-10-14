import type { Database, SqlValue } from '../database/Database';
import { bookIndex, parseReference } from '../../domain/bible/reference';
import type { CardKind } from '../../domain/study/cardKind';
import { startOfLocalDay } from '../../domain/scheduling/format';
import type { Clock } from './util';

export interface BookProgress {
  book: string;
  total: number;
  memorized: number;
}

export interface StatsOverview {
  /** Verses added (not study cards). */
  totalCards: number;
  /** Verses whose every studied card is currently in the Review state: recalled well enough to graduate from learning. */
  memorized: number;
  /** Verses whose every studied card is in Review with an interval of 21+ days. */
  mastered: number;
  /** Calendar days between the first review and today (0 on the first day, or if nothing was reviewed yet). */
  daysSinceStarting: number;
  /** Study cards (each verse can have two) by stage. */
  counts: { new: number; learning: number; young: number; mature: number };
  /** Only books that have at least one verse, in Bible order. */
  books: BookProgress[];
}

export interface StatsRepository {
  /** `deckId` null means every deck (a verse in two decks counts once). `kinds` is which study cards are in use. */
  overview(deckId: string | null, kinds: CardKind[]): Promise<StatsOverview>;
}

type Row = Record<string, SqlValue>;

const EMPTY: StatsOverview = { totalCards: 0, memorized: 0, mastered: 0, daysSinceStarting: 0, counts: { new: 0, learning: 0, young: 0, mature: 0 }, books: [] };

export function createStatsRepository(db: Database, now: Clock = Date.now): StatsRepository {
  return {
    async overview(deckId, kinds) {
      if (kinds.length === 0) return structuredClone(EMPTY);
      const kindsJoin = `JOIN (SELECT 'recall' AS kind UNION ALL SELECT 'identify') k ON k.kind IN (${kinds.map(() => '?').join(', ')})`;
      const rows = await db.query<Row>(
        deckId === null
          ? `SELECT c.id, c.reference, k.kind, s.state, s.scheduled_days
               FROM cards c ${kindsJoin} LEFT JOIN card_schedule s ON s.card_id = c.id AND s.kind = k.kind`
          : `SELECT c.id, c.reference, k.kind, s.state, s.scheduled_days
               FROM deck_cards dc JOIN cards c ON c.id = dc.card_id ${kindsJoin}
               LEFT JOIN card_schedule s ON s.card_id = c.id AND s.kind = k.kind
              WHERE dc.deck_id = ?`,
        deckId === null ? [...kinds] : [...kinds, deckId],
      );
      const [first] = await db.query<{ t: number | null }>(
        deckId === null
          ? 'SELECT MIN(reviewed_at) AS t FROM review_logs'
          : `SELECT MIN(r.reviewed_at) AS t FROM review_logs r JOIN deck_cards dc ON dc.card_id = r.card_id WHERE dc.deck_id = ?`,
        deckId === null ? [] : [deckId],
      );

      const counts = { new: 0, learning: 0, young: 0, mature: 0 };
      const verses = new Map<string, { reference: string; allReview: boolean; allMature: boolean }>();
      for (const r of rows) {
        const state = r.state as number | null;
        const days = Number(r.scheduled_days ?? 0);
        if (state === null) counts.new++;
        else if (state === 1 || state === 3) counts.learning++;
        else if (days >= 21) counts.mature++;
        else counts.young++;

        const id = r.id as string;
        const v = verses.get(id) ?? { reference: r.reference as string, allReview: true, allMature: true };
        if (state !== 2) v.allReview = false;
        if (!(state === 2 && days >= 21)) v.allMature = false;
        verses.set(id, v);
      }

      const byBook = new Map<string, BookProgress>();
      let memorized = 0;
      let mastered = 0;
      for (const v of verses.values()) {
        if (v.allReview) memorized++;
        if (v.allMature) mastered++;
        const book = parseReference(v.reference)?.book;
        if (book) {
          const entry = byBook.get(book) ?? { book, total: 0, memorized: 0 };
          entry.total++;
          if (v.allReview) entry.memorized++;
          byBook.set(book, entry);
        }
      }

      const t = now();
      const daysSinceStarting = first?.t == null ? 0 : Math.max(0, Math.round((startOfLocalDay(t) - startOfLocalDay(first.t)) / 86_400_000));
      return {
        totalCards: verses.size,
        memorized,
        mastered,
        daysSinceStarting,
        counts,
        books: [...byBook.values()].sort((a, b) => bookIndex(a.book) - bookIndex(b.book)),
      };
    },
  };
}
