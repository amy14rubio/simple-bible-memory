import { createEmptyCard, fsrs, FSRSVersion, State, type Card as FsrsCard, type FSRS, type Grade } from 'ts-fsrs';
import type { Rating } from '../study/rating';

/**
 * The only file that knows about ts-fsrs. No React, no database.
 * All times are UTC epoch milliseconds; the scheduler never reads the clock itself,
 * the caller passes `now`, which makes every result reproducible.
 */

/** Same numbers as ts-fsrs's State enum and the `card_schedule.state` CHECK constraint. */
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;
export type CardState = (typeof CardState)[keyof typeof CardState];

/** Everything needed to restore a card's FSRS state. Mirrors the `card_schedule` table. */
export interface Schedule {
  due: number;
  stability: number;
  difficulty: number;
  state: CardState;
  reps: number;
  lapses: number;
  learningSteps: number;
  scheduledDays: number;
  lastReview: number | null;
}

/** What gets written to `review_logs` for one review. */
export interface ReviewLogData {
  stateBefore: CardState;
  dueBefore: number;
  /** Values after this review: */
  stability: number;
  difficulty: number;
  scheduledDays: number;
  elapsedDays: number;
}

export interface ReviewOutcome {
  schedule: Schedule;
  log: ReviewLogData;
}

/**
 * Deliberate choices, all easy to change later:
 *  - requestRetention 0.9: aim to remember 90% of cards when they come due (library default).
 *  - enableFuzz false: no random +/- jitter on intervals, so results are deterministic (library default).
 *  - learning steps 1m, 10m and relearning step 10m (library defaults).
 * Parameters (FSRS "weights") are the library defaults. Personalized optimization is not part of the MVP.
 */
export interface SchedulerConfig {
  requestRetention?: number;
  /** Longest gap between reviews, in days. Enforced strictly (see DEFAULT_MAXIMUM_INTERVAL_DAYS). */
  maximumInterval?: number;
  enableFuzz?: boolean;
}

/**
 * About six months. FSRS would happily schedule a well-known card years apart, which is too long for scripture
 * you want to keep fresh. ts-fsrs's own `maximum_interval` is not a strict ceiling (a chain of Easy ratings can
 * exceed it), so this module also clamps every result itself.
 */
export const DEFAULT_MAXIMUM_INTERVAL_DAYS = 180;
const DAY_MS = 86_400_000;

/** Records which scheduler produced a schedule, so future migrations can tell them apart. */
export const SCHEDULER_VERSION = `ts-fsrs ${FSRSVersion}`;

const GRADES: Record<Rating, Grade> = { 1: 1, 2: 2, 3: 3, 4: 4 }; // ts-fsrs Rating.Again..Easy = 1..4

export interface Scheduler {
  /** Initial state for a card that has never been reviewed. */
  newSchedule(now: number): Schedule;
  /** Apply one review. `schedule` is null for a card that has never been reviewed. */
  review(schedule: Schedule | null, rating: Rating, now: number): ReviewOutcome;
  /** When the card would next be due for each possible rating. Does not change anything. */
  preview(schedule: Schedule | null, now: number): Record<Rating, number>;
  isDue(schedule: Schedule, now: number): boolean;
}

function assertTime(value: number, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} must be a finite number of milliseconds`);
}

function assertRating(rating: number): asserts rating is Rating {
  if (!Number.isInteger(rating) || rating < 1 || rating > 4) throw new RangeError(`Invalid rating ${rating}: expected 1 (Again) to 4 (Easy)`);
}

function assertSchedule(s: Schedule) {
  assertTime(s.due, 'schedule.due');
  if (s.lastReview !== null) assertTime(s.lastReview, 'schedule.lastReview');
  for (const key of ['stability', 'difficulty', 'reps', 'lapses', 'learningSteps', 'scheduledDays'] as const) {
    if (!Number.isFinite(s[key]) || s[key] < 0) throw new RangeError(`schedule.${key} must be a non-negative number`);
  }
  if (![0, 1, 2, 3].includes(s.state)) throw new RangeError(`schedule.state must be 0-3, got ${s.state}`);
}

const toFsrsCard = (s: Schedule): FsrsCard => ({
  due: new Date(s.due),
  stability: s.stability,
  difficulty: s.difficulty,
  elapsed_days: 0, // deprecated upstream; ts-fsrs recomputes it from last_review and `now`
  scheduled_days: s.scheduledDays,
  learning_steps: s.learningSteps,
  reps: s.reps,
  lapses: s.lapses,
  state: s.state as State,
  last_review: s.lastReview === null ? undefined : new Date(s.lastReview),
});

const fromFsrsCard = (c: FsrsCard): Schedule => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  state: c.state as CardState,
  reps: c.reps,
  lapses: c.lapses,
  learningSteps: c.learning_steps,
  scheduledDays: c.scheduled_days,
  lastReview: c.last_review ? c.last_review.getTime() : null,
});

export function createScheduler(config: SchedulerConfig = {}): Scheduler {
  const maxDays = config.maximumInterval ?? DEFAULT_MAXIMUM_INTERVAL_DAYS;
  const engine: FSRS = fsrs({
    request_retention: config.requestRetention,
    maximum_interval: maxDays,
    enable_fuzz: config.enableFuzz ?? false,
  });

  /** The latest a card may come due, given when it is reviewed. */
  const latestDue = (now: number) => now + maxDays * DAY_MS;
  const capped = (s: Schedule, now: number): Schedule =>
    s.due > latestDue(now) ? { ...s, due: latestDue(now), scheduledDays: Math.min(s.scheduledDays, maxDays) } : s;

  const cardFor = (schedule: Schedule | null, now: number): FsrsCard => {
    assertTime(now, 'now');
    if (schedule === null) return createEmptyCard(new Date(now));
    assertSchedule(schedule);
    return toFsrsCard(schedule);
  };

  return {
    newSchedule: (now) => {
      assertTime(now, 'now');
      return fromFsrsCard(createEmptyCard(new Date(now)));
    },

    review(schedule, rating, now) {
      assertRating(rating);
      const card = cardFor(schedule, now);
      const { card: next, log } = engine.next(card, new Date(now), GRADES[rating]);
      const after = capped(fromFsrsCard(next), now);
      return {
        schedule: after,
        log: {
          stateBefore: (schedule?.state ?? CardState.New) as CardState,
          dueBefore: schedule?.due ?? now,
          stability: after.stability,
          difficulty: after.difficulty,
          scheduledDays: after.scheduledDays,
          elapsedDays: log.elapsed_days, // deprecated upstream (removed in v6); pinned to v5 for now
        },
      };
    },

    preview(schedule, now) {
      const record = engine.repeat(cardFor(schedule, now), new Date(now));
      const due = (r: Rating) => Math.min(record[r].card.due.getTime(), latestDue(now));
      return { 1: due(1), 2: due(2), 3: due(3), 4: due(4) };
    },

    isDue(schedule, now) {
      assertSchedule(schedule);
      assertTime(now, 'now');
      return schedule.due <= now;
    },
  };
}
