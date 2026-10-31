import type { Database, SqlValue } from '../database/Database';
import type { Card } from '../../domain/types';
import type { Rating } from '../../domain/study/rating';
import type { CardKind } from '../../domain/study/cardKind';
import { SCHEDULER_VERSION, CardState, type Schedule, type Scheduler } from '../../domain/scheduling/scheduler';
import { startOfLocalDay } from '../../domain/scheduling/format';
import { toCard } from './cardRepository';
import type { Clock } from './util';

export type StudyMode = 'flashcard' | 'type' | 'blanks';

/** One study card: a verse seen in one direction, plus its schedule (null = never reviewed, i.e. new). */
/**
 * A card being learned (rated Again/Hard/Good a few minutes ago) counts as due if it comes up within this time, so leaving a
 * session early does not make the deck look finished while such cards are still waiting (the same idea as Anki's "learn ahead").
 */
export const LEARN_AHEAD_MS = 20 * 60_000;

export interface QueueEntry {
  card: Card;
  kind: CardKind;
  schedule: Schedule | null;
}

/** Counts of STUDY cards (each verse can have two: recall and identify). */
export interface DeckStats {
  total: number;
  /** Never reviewed. */
  new: number;
  /** Learning or relearning. */
  learning: number;
  /** Review state with an interval under 21 days. */
  young: number;
  /** Review state with an interval of 21+ days. */
  mature: number;
  /** Scheduled cards whose due time has passed. */
  due: number;
}

export interface QueueOptions {
  /** Max NEW study cards introduced per local day, counted across all decks. */
  newPerDay: number;
  /** Which kinds of study card to include. */
  kinds: CardKind[];
}

export interface ReviewRepository {
  getSchedule(cardId: string, kind: CardKind): Promise<Schedule | undefined>;
  /**
   * Records one review atomically: reads that study card's current schedule, computes the next one,
   * saves it, and appends a review log. If any step fails, nothing is written.
   */
  record(input: { cardId: string; kind: CardKind; rating: Rating; mode: StudyMode }): Promise<Schedule>;
  /** Today's study queue: due cards (oldest due first), then new cards up to today's remaining allowance. A verse's two cards may both appear. */
  buildQueue(deckId: string, options: QueueOptions): Promise<QueueEntry[]>;
  /**
   * How many study cards are waiting in each deck today (due plus new, within the daily new-card limit shared by all decks).
   * Keyed by deck id; every deck is present, with 0 when nothing is waiting.
   */
  dueCounts(options: QueueOptions): Promise<Record<string, number>>;
  /** Every study card in the deck, for extra practice sessions that never touch the schedule. */
  listForExtraPractice(deckId: string, kinds: CardKind[]): Promise<QueueEntry[]>;
  /** When the soonest not-yet-due study card comes due (epoch ms), or null if there is none. */
  nextDue(deckId: string, kinds: CardKind[]): Promise<number | null>;
  stats(deckId: string, kinds: CardKind[]): Promise<DeckStats>;
}

type Row = Record<string, SqlValue>;

const toSchedule = (r: Row): Schedule => ({
  due: r.s_due as number,
  stability: r.s_stability as number,
  difficulty: r.s_difficulty as number,
  state: r.s_state as CardState,
  reps: r.s_reps as number,
  lapses: r.s_lapses as number,
  learningSteps: r.s_learning_steps as number,
  scheduledDays: r.s_scheduled_days as number,
  lastReview: r.s_last_review as number | null,
});

const SCHEDULE_COLUMNS = `s.due AS s_due, s.stability AS s_stability, s.difficulty AS s_difficulty, s.state AS s_state,
  s.reps AS s_reps, s.lapses AS s_lapses, s.learning_steps AS s_learning_steps,
  s.scheduled_days AS s_scheduled_days, s.last_review AS s_last_review`;

// Cards without text (a licensed card whose text has not been fetched to this device yet) are left out of every list: there is nothing to study.
/** Joins each verse with the kinds being studied, whether or not a schedule exists yet. */
const KINDS_JOIN = (n: number) => `JOIN (SELECT 'recall' AS kind UNION ALL SELECT 'identify') k ON k.kind IN (${Array(n).fill('?').join(', ')})`;

const toEntry = (r: Row): QueueEntry => ({ card: toCard(r), kind: r.kind as CardKind, schedule: r.s_due === null ? null : toSchedule(r) });

export function createReviewRepository(db: Database, scheduler: Scheduler, now: Clock = Date.now): ReviewRepository {
  /** Due cards and new cards, before the daily new-card limit is applied. */
  async function candidates(deckId: string, kinds: CardKind[], t: number) {
    const due = (await db.query<Row>(
      `SELECT c.*, s.kind AS kind, ${SCHEDULE_COLUMNS}
         FROM cards c JOIN deck_cards dc ON dc.card_id = c.id JOIN card_schedule s ON s.card_id = c.id
        WHERE dc.deck_id = ? AND c.verse_text <> '' AND (s.due <= ? OR (s.state IN (1, 3) AND s.due <= ?)) AND s.kind IN (${kinds.map(() => '?').join(', ')})
        ORDER BY s.due, c.created_at`,
      [deckId, t, t + LEARN_AHEAD_MS, ...kinds],
    )).map(toEntry);
    const fresh = (await db.query<Row>(
      `SELECT c.*, k.kind AS kind, ${SCHEDULE_COLUMNS}
         FROM cards c JOIN deck_cards dc ON dc.card_id = c.id ${KINDS_JOIN(kinds.length)}
         LEFT JOIN card_schedule s ON s.card_id = c.id AND s.kind = k.kind
        WHERE dc.deck_id = ? AND c.verse_text <> '' AND s.card_id IS NULL
        ORDER BY dc.added_at, c.created_at, (k.kind = 'identify')`,
      [...kinds, deckId],
    )).map(toEntry);
    return { due, fresh };
  }

  /**
   * Cards that were started today beyond the daily new-card limit (the limit was lowered after they were started). They are being
   * learned, so they would still be on the list; instead they wait until tomorrow, with their progress kept. The first
   * `newPerDay` cards started today (across all decks) stay. Raising the limit again brings the rest back.
   */
  async function postponedToday(newPerDay: number, t: number): Promise<Set<string>> {
    const started = await db.query<{ card_id: string; kind: string }>(
      'SELECT card_id, kind FROM review_logs WHERE state_before = 0 AND reviewed_at >= ? ORDER BY reviewed_at, rowid',
      [startOfLocalDay(t)],
    );
    return new Set(started.slice(newPerDay).map((r) => `${r.card_id}:${r.kind}`));
  }
  const isLearning = (e: QueueEntry) => e.schedule?.state === CardState.Learning || e.schedule?.state === CardState.Relearning;

  /** New study cards still allowed today. A new card's first review is the one logged with state_before = New (0). */
  async function newAllowance(newPerDay: number, t: number) {
    const [introduced] = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM review_logs WHERE state_before = 0 AND reviewed_at >= ?', [startOfLocalDay(t)]);
    return Math.max(0, newPerDay - Number(introduced?.n ?? 0));
  }

  return {
    async getSchedule(cardId, kind) {
      const rows = await db.query<Row>(`SELECT ${SCHEDULE_COLUMNS} FROM card_schedule s WHERE s.card_id = ? AND s.kind = ?`, [cardId, kind]);
      return rows[0] ? toSchedule(rows[0]) : undefined;
    },

    async record({ cardId, kind, rating, mode }) {
      const t = now();
      return db.transaction(async (tx) => {
        const rows = await tx.query<Row>(`SELECT ${SCHEDULE_COLUMNS} FROM card_schedule s WHERE s.card_id = ? AND s.kind = ?`, [cardId, kind]);
        const { schedule, log } = scheduler.review(rows[0] ? toSchedule(rows[0]) : null, rating, t);

        // Upsert the current state...
        await tx.run(
          `INSERT INTO card_schedule (card_id, kind, due, stability, difficulty, state, reps, lapses, learning_steps, scheduled_days, last_review, scheduler_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(card_id, kind) DO UPDATE SET due = excluded.due, stability = excluded.stability, difficulty = excluded.difficulty,
             state = excluded.state, reps = excluded.reps, lapses = excluded.lapses, learning_steps = excluded.learning_steps,
             scheduled_days = excluded.scheduled_days, last_review = excluded.last_review, scheduler_version = excluded.scheduler_version`,
          [cardId, kind, schedule.due, schedule.stability, schedule.difficulty, schedule.state, schedule.reps, schedule.lapses,
            schedule.learningSteps, schedule.scheduledDays, schedule.lastReview, SCHEDULER_VERSION],
        );
        // ...and append to the history. (An unknown card fails the foreign key and rolls both back.)
        await tx.run(
          `INSERT INTO review_logs (id, card_id, kind, reviewed_at, rating, study_mode, state_before, due_before, stability, difficulty, scheduled_days, elapsed_days)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), cardId, kind, t, rating, mode, log.stateBefore, log.dueBefore, log.stability, log.difficulty, log.scheduledDays, log.elapsedDays],
        );
        return schedule;
      });
    },

    async buildQueue(deckId, { newPerDay, kinds }) {
      if (kinds.length === 0) return [];
      const t = now();
      const { due, fresh } = await candidates(deckId, kinds, t);
      const postponed = await postponedToday(newPerDay, t);
      return [...due.filter((e) => !(isLearning(e) && postponed.has(`${e.card.id}:${e.kind}`))), ...fresh.slice(0, await newAllowance(newPerDay, t))];
    },

    async dueCounts({ newPerDay, kinds }) {
      const t = now();
      const counts: Record<string, number> = {};
      // The daily new-card limit is one total for all decks, first come first served. Each deck is counted as if it were opened first,
      // so the number on the home list is exactly what the deck's own page and its study session show.
      const allowance = await newAllowance(newPerDay, t);
      const postponed = await postponedToday(newPerDay, t);
      for (const { id } of await db.query<{ id: string }>('SELECT id FROM decks ORDER BY title COLLATE NOCASE')) {
        if (kinds.length === 0) { counts[id] = 0; continue; }
        const { due, fresh } = await candidates(id, kinds, t);
        counts[id] = due.filter((e) => !(isLearning(e) && postponed.has(`${e.card.id}:${e.kind}`))).length + Math.min(fresh.length, allowance);
      }
      return counts;
    },

    async listForExtraPractice(deckId, kinds) {
      if (kinds.length === 0) return [];
      const rows = await db.query<Row>(
        `SELECT c.*, k.kind AS kind, ${SCHEDULE_COLUMNS}
           FROM cards c JOIN deck_cards dc ON dc.card_id = c.id ${KINDS_JOIN(kinds.length)}
           LEFT JOIN card_schedule s ON s.card_id = c.id AND s.kind = k.kind
          WHERE dc.deck_id = ? AND c.verse_text <> '' ORDER BY dc.added_at, c.created_at, (k.kind = 'identify')`,
        [...kinds, deckId],
      );
      return rows.map(toEntry);
    },

    async nextDue(deckId, kinds) {
      if (kinds.length === 0) return null;
      const [r] = await db.query<{ t: number | null }>(
        `SELECT MIN(s.due) AS t FROM card_schedule s JOIN deck_cards dc ON dc.card_id = s.card_id
          WHERE dc.deck_id = ? AND s.due > ? AND s.kind IN (${kinds.map(() => '?').join(', ')})`,
        [deckId, now(), ...kinds],
      );
      return r?.t ?? null;
    },

    async stats(deckId, kinds) {
      if (kinds.length === 0) return { total: 0, new: 0, learning: 0, young: 0, mature: 0, due: 0 };
      const [r] = await db.query<Row>(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(s.card_id IS NULL), 0) AS new_count,
                COALESCE(SUM(s.state IN (1, 3)), 0) AS learning,
                COALESCE(SUM(s.state = 2 AND s.scheduled_days < 21), 0) AS young,
                COALESCE(SUM(s.state = 2 AND s.scheduled_days >= 21), 0) AS mature,
                COALESCE(SUM(s.due <= ?), 0) AS due
           FROM deck_cards dc ${KINDS_JOIN(kinds.length)}
           LEFT JOIN card_schedule s ON s.card_id = dc.card_id AND s.kind = k.kind
          WHERE dc.deck_id = ?`,
        [now(), ...kinds, deckId],
      );
      return {
        total: Number(r?.total ?? 0),
        new: Number(r?.new_count ?? 0),
        learning: Number(r?.learning ?? 0),
        young: Number(r?.young ?? 0),
        mature: Number(r?.mature ?? 0),
        due: Number(r?.due ?? 0),
      };
    },
  };
}
