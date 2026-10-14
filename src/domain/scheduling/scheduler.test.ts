import { describe, it, expect } from 'vitest';
import { fsrs, createEmptyCard, Rating as LibRating, State } from 'ts-fsrs';
import { CardState, DEFAULT_MAXIMUM_INTERVAL_DAYS, SCHEDULER_VERSION, createScheduler, type Schedule } from './scheduler';
import { formatInterval, startOfLocalDay } from './format';
import type { Rating } from '../study/rating';

const MIN = 60_000, DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 15, 12, 0, 0);
const s = createScheduler();
const RATINGS: Rating[] = [1, 2, 3, 4];

describe('constants', () => {
  it('CardState numbers match the ts-fsrs State enum (and the DB CHECK constraint)', () => {
    expect(CardState).toEqual({ New: State.New, Learning: State.Learning, Review: State.Review, Relearning: State.Relearning });
  });
  it('records the scheduler version', () => {
    expect(SCHEDULER_VERSION).toMatch(/ts-fsrs v5\.\d+\.\d+ using FSRS-6/);
  });
});

describe('new cards', () => {
  it('start New, due immediately, never reviewed', () => {
    expect(s.newSchedule(T0)).toMatchObject({ state: CardState.New, due: T0, reps: 0, lapses: 0, lastReview: null });
  });
  it('a new card is due', () => {
    expect(s.isDue(s.newSchedule(T0), T0)).toBe(true);
  });
});

describe('each rating on a new card (documented default learning steps: 1m, 10m)', () => {
  it('Again: Learning, due in 1 minute', () => {
    const { schedule } = s.review(null, 1, T0);
    expect(schedule).toMatchObject({ state: CardState.Learning, due: T0 + 1 * MIN, reps: 1, lapses: 0, lastReview: T0 });
  });
  it('Hard: Learning, due in minutes, later than Again', () => {
    const hard = s.review(null, 2, T0).schedule;
    expect(hard.state).toBe(CardState.Learning);
    expect(hard.due).toBeGreaterThan(T0 + 1 * MIN);
  });
  it('Good: Learning, due in 10 minutes (second step)', () => {
    expect(s.review(null, 3, T0).schedule).toMatchObject({ state: CardState.Learning, due: T0 + 10 * MIN });
  });
  it('Easy: graduates straight to Review, due at least a day out', () => {
    const { schedule } = s.review(null, 4, T0);
    expect(schedule.state).toBe(CardState.Review);
    expect(schedule.due).toBeGreaterThanOrEqual(T0 + DAY);
  });
  it('every rating produces a positive stability and a difficulty', () => {
    for (const r of RATINGS) {
      const { schedule } = s.review(null, r, T0);
      expect(schedule.stability).toBeGreaterThan(0);
      expect(schedule.difficulty).toBeGreaterThan(0);
    }
  });
  it('Easy gives a higher stability than Good, Good than Hard, Hard than Again', () => {
    const st = RATINGS.map((r) => s.review(null, r, T0).schedule.stability);
    expect(st[0]!).toBeLessThan(st[1]!);
    expect(st[1]!).toBeLessThan(st[2]!);
    expect(st[2]!).toBeLessThan(st[3]!);
  });
});

describe('repeated reviews', () => {
  const graduate = (): Schedule => {
    let sched = s.review(null, 3, T0).schedule; // Good -> learning step 2
    sched = s.review(sched, 3, sched.due).schedule; // Good -> graduates
    return sched;
  };

  it('two Goods graduate a new card to Review', () => {
    const g = graduate();
    expect(g.state).toBe(CardState.Review);
    expect(g.reps).toBe(2);
    expect(g.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('successful on-time reviews grow the interval', () => {
    let sched = graduate();
    let previous = sched.scheduledDays;
    for (let i = 0; i < 4; i++) {
      sched = s.review(sched, 3, sched.due).schedule;
      expect(sched.scheduledDays).toBeGreaterThan(previous);
      previous = sched.scheduledDays;
    }
  });

  it('for a Review card: Again < Hard <= Good <= Easy intervals', () => {
    const g = graduate();
    const due = Object.fromEntries(RATINGS.map((r) => [r, s.review(g, r, g.due).schedule.due])) as Record<Rating, number>;
    expect(due[1]).toBeLessThan(due[2]);
    expect(due[2]).toBeLessThanOrEqual(due[3]);
    expect(due[3]).toBeLessThanOrEqual(due[4]);
  });

  it('Again on a Review card is a lapse: relearning, lapses+1, lower stability', () => {
    const g = graduate();
    const lapsed = s.review(g, 1, g.due).schedule;
    expect(lapsed.state).toBe(CardState.Relearning);
    expect(lapsed.lapses).toBe(g.lapses + 1);
    expect(lapsed.stability).toBeLessThan(g.stability);
  });

  it('a lapsed card can recover back to Review', () => {
    const g = graduate();
    let sched = s.review(g, 1, g.due).schedule;
    sched = s.review(sched, 3, sched.due).schedule;
    expect(sched.state).toBe(CardState.Review);
    expect(sched.lapses).toBe(1);
  });

  it('log records state/due before and values after', () => {
    const g = graduate();
    const { log, schedule } = s.review(g, 3, g.due);
    expect(log).toMatchObject({ stateBefore: CardState.Review, dueBefore: g.due, stability: schedule.stability, difficulty: schedule.difficulty, scheduledDays: schedule.scheduledDays });
  });
  it('log for a first review says it started New and due now', () => {
    expect(s.review(null, 3, T0).log).toMatchObject({ stateBefore: CardState.New, dueBefore: T0, elapsedDays: 0 });
  });
});

describe('mistakes demote a well-known card', () => {
  /** Easy, Easy, Easy: a mature verse (months between reviews). */
  const mature = (): Schedule => {
    let sched: Schedule | null = null;
    let now = T0;
    for (let i = 0; i < 3; i++) { sched = s.review(sched, 4, now).schedule; now = sched.due; }
    return sched!;
  };

  it('starts out mature: in Review with an interval of 21+ days', () => {
    const m = mature();
    expect(m.state).toBe(CardState.Review);
    expect(m.scheduledDays).toBeGreaterThanOrEqual(21);
  });

  it('one Again knocks it out of Review into Relearning and collapses its stability', () => {
    const m = mature();
    const lapsed = s.review(m, 1, m.due).schedule;
    expect(lapsed.state).toBe(CardState.Relearning);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(m.stability * 0.25);
    expect(lapsed.difficulty).toBeGreaterThan(m.difficulty);
  });

  it('after recovering with Good it comes back young (under 21 days), not mature', () => {
    const m = mature();
    const lapsed = s.review(m, 1, m.due).schedule;
    const recovered = s.review(lapsed, 3, lapsed.due).schedule;
    expect(recovered.state).toBe(CardState.Review);
    expect(recovered.scheduledDays).toBeLessThan(21);
    expect(recovered.scheduledDays).toBeLessThan(m.scheduledDays);
  });

  it('repeated mistakes keep it demoted: intervals stay short and difficulty keeps rising', () => {
    const m = mature();
    let sched = s.review(m, 1, m.due).schedule; // Again
    sched = s.review(sched, 3, sched.due).schedule; // recover
    const afterFirst = sched;
    sched = s.review(sched, 1, sched.due).schedule; // Again, a second time
    sched = s.review(sched, 3, sched.due).schedule;
    expect(sched.lapses).toBe(2);
    expect(sched.scheduledDays).toBeLessThan(afterFirst.scheduledDays);
    expect(sched.scheduledDays).toBeLessThan(21);
    expect(sched.difficulty).toBeGreaterThan(afterFirst.difficulty);
  });

  it('Hard is still a successful recall, so it does not demote (only Again does)', () => {
    const m = mature();
    const hard = s.review(m, 2, m.due).schedule;
    expect(hard.state).toBe(CardState.Review);
    expect(hard.lapses).toBe(0);
    expect(hard.difficulty).toBeGreaterThan(m.difficulty);
  });

  it('a verse that has sat at the six-month cap for years is demoted just as hard by one Again', () => {
    let sched: Schedule | null = null;
    let now = T0;
    for (let i = 0; i < 12; i++) { sched = s.review(sched, 3, now).schedule; now = sched.due; }
    const lapsed = s.review(sched, 1, now).schedule;
    expect(lapsed.state).toBe(CardState.Relearning);
    expect(lapsed.stability).toBeLessThan(50);
    const recovered = s.review(lapsed, 3, lapsed.due).schedule;
    expect(recovered.scheduledDays).toBeLessThan(21);
  });
});

describe('missed (late) reviews', () => {
  it('reviewing well after the due date still works and gives a longer or equal interval than on time', () => {
    let sched = s.review(null, 4, T0).schedule;
    const onTime = s.review(sched, 3, sched.due).schedule;
    const late = s.review(sched, 3, sched.due + 30 * DAY).schedule;
    expect(late.scheduledDays).toBeGreaterThanOrEqual(onTime.scheduledDays);
    expect(late.lastReview).toBe(sched.due + 30 * DAY);
    sched = late;
    expect(sched.state).toBe(CardState.Review);
  });
  it('a card is not due before its due time, and is due at and after it', () => {
    const { schedule } = s.review(null, 3, T0);
    expect(s.isDue(schedule, schedule.due - 1)).toBe(false);
    expect(s.isDue(schedule, schedule.due)).toBe(true);
    expect(s.isDue(schedule, schedule.due + 1)).toBe(true);
  });
});

describe('invalid input', () => {
  it('rejects bad ratings', () => {
    for (const bad of [0, 5, -1, 2.5, NaN]) {
      expect(() => s.review(null, bad as Rating, T0)).toThrow(RangeError);
    }
  });
  it('rejects non-finite or non-numeric times', () => {
    expect(() => s.review(null, 3, NaN)).toThrow(TypeError);
    expect(() => s.review(null, 3, Infinity)).toThrow(TypeError);
    expect(() => s.review(null, 3, '2026-01-01' as unknown as number)).toThrow(TypeError);
    expect(() => s.newSchedule(NaN)).toThrow(TypeError);
  });
  it('rejects corrupt stored schedules instead of scheduling garbage', () => {
    const good = s.review(null, 3, T0).schedule;
    expect(() => s.review({ ...good, stability: NaN }, 3, T0)).toThrow(RangeError);
    expect(() => s.review({ ...good, state: 9 as never }, 3, T0)).toThrow(RangeError);
    expect(() => s.review({ ...good, due: NaN }, 3, T0)).toThrow(TypeError);
    expect(() => s.review({ ...good, reps: -1 }, 3, T0)).toThrow(RangeError);
  });
});

describe('persistence and restoration', () => {
  it('a schedule survives JSON round-trip (what a database would store) with identical future behavior', () => {
    const a = s.review(s.review(null, 3, T0).schedule, 3, T0 + 10 * MIN).schedule;
    const restored = JSON.parse(JSON.stringify(a)) as Schedule;
    expect(restored).toEqual(a);
    expect(s.review(restored, 2, a.due)).toEqual(s.review(a, 2, a.due));
  });
  it('a never-reviewed card keeps lastReview null through a round-trip', () => {
    const restored = JSON.parse(JSON.stringify(s.newSchedule(T0))) as Schedule;
    expect(restored.lastReview).toBeNull();
    expect(s.review(restored, 3, T0).schedule).toEqual(s.review(null, 3, T0).schedule);
  });
});

describe('reproducibility and agreement with the library', () => {
  it('same inputs give identical outputs, repeatedly', () => {
    const first = s.review(s.review(null, 3, T0).schedule, 4, T0 + 10 * MIN);
    for (let i = 0; i < 5; i++) expect(s.review(s.review(null, 3, T0).schedule, 4, T0 + 10 * MIN)).toEqual(first);
  });
  it('two scheduler instances agree', () => {
    expect(createScheduler().review(null, 2, T0)).toEqual(createScheduler().review(null, 2, T0));
  });
  it('matches ts-fsrs called directly (wrapper adds no behavior of its own)', () => {
    const lib = fsrs({ enable_fuzz: false });
    for (const r of RATINGS) {
      const expected = lib.next(createEmptyCard(new Date(T0)), new Date(T0), r as LibRating.Again).card;
      const got = s.review(null, r, T0).schedule;
      expect(got).toMatchObject({ due: expected.due.getTime(), stability: expected.stability, difficulty: expected.difficulty, state: expected.state, reps: expected.reps });
    }
  });
  it('preview() equals the due times review() would produce, and changes nothing', () => {
    const base = s.review(null, 3, T0).schedule;
    const copy = structuredClone(base);
    const p = s.preview(base, base.due);
    for (const r of RATINGS) expect(p[r]).toBe(s.review(base, r, base.due).schedule.due);
    expect(base).toEqual(copy);
    expect(s.preview(null, T0)[3]).toBe(s.review(null, 3, T0).schedule.due);
  });
});

describe('time zones', () => {
  it('epoch results are identical in different time zones, across a DST change', () => {
    const run = () => {
      let sched = s.review(null, 3, Date.UTC(2026, 2, 7, 12)).schedule; // days before US DST starts (Mar 8, 2026)
      sched = s.review(sched, 3, sched.due).schedule;
      for (let i = 0; i < 3; i++) sched = s.review(sched, 3, sched.due).schedule;
      return sched;
    };
    const original = process.env.TZ;
    try {
      const results = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'].map((tz) => {
        process.env.TZ = tz;
        return run();
      });
      for (const r of results) expect(r).toEqual(results[0]);
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });
});

describe('configuration', () => {
  it('higher requested retention never schedules a longer interval', () => {
    const base = s.review(s.review(null, 3, T0).schedule, 3, T0 + 10 * MIN).schedule;
    const hi = createScheduler({ requestRetention: 0.95 }).review(base, 3, base.due).schedule.scheduledDays;
    const lo = createScheduler({ requestRetention: 0.8 }).review(base, 3, base.due).schedule.scheduledDays;
    expect(hi).toBeLessThanOrEqual(lo);
  });
  it('the default cap is about six months (180 days)', () => {
    expect(DEFAULT_MAXIMUM_INTERVAL_DAYS).toBe(180);
  });

  it('no review is ever scheduled further out than the cap, whether you answer Good or Easy', () => {
    for (const rating of [3, 4] as Rating[]) {
      let sched: Schedule | null = null;
      let now = T0;
      for (let i = 0; i < 14; i++) {
        sched = s.review(sched, rating, now).schedule;
        expect(sched.due - now).toBeLessThanOrEqual(DEFAULT_MAXIMUM_INTERVAL_DAYS * DAY);
        expect(sched.scheduledDays).toBeLessThanOrEqual(DEFAULT_MAXIMUM_INTERVAL_DAYS);
        now = sched.due;
      }
    }
  });

  it('a well-known card ends up at the cap, not years out', () => {
    let sched: Schedule | null = null;
    let now = T0;
    for (let i = 0; i < 14; i++) { sched = s.review(sched, 3, now).schedule; now = sched.due; }
    const next = s.review(sched, 3, now).schedule;
    expect(Math.round((next.due - now) / DAY)).toBe(DEFAULT_MAXIMUM_INTERVAL_DAYS);
  });

  it('the preview hints respect the cap too, and agree with what review() does', () => {
    let sched: Schedule | null = null;
    let now = T0;
    for (let i = 0; i < 14; i++) { sched = s.review(sched, 3, now).schedule; now = sched.due; }
    const p = s.preview(sched, now);
    for (const r of RATINGS) {
      expect(p[r] - now).toBeLessThanOrEqual(DEFAULT_MAXIMUM_INTERVAL_DAYS * DAY);
      expect(p[r]).toBe(s.review(sched, r, now).schedule.due);
    }
    expect(formatInterval(p[4] - now)).toBe('6mo');
  });

  it('the cap is configurable and strict', () => {
    const month = createScheduler({ maximumInterval: 30 });
    let sched: Schedule | null = null;
    let now = T0;
    for (let i = 0; i < 10; i++) {
      sched = month.review(sched, 4, now).schedule;
      expect(sched.due - now).toBeLessThanOrEqual(30 * DAY);
      now = sched.due;
    }
  });

  it('intervals below the cap are untouched', () => {
    const uncapped = createScheduler({ maximumInterval: 36500 });
    const a = s.review(s.review(null, 3, T0).schedule, 3, T0 + 10 * MIN);
    const b = uncapped.review(uncapped.review(null, 3, T0).schedule, 3, T0 + 10 * MIN);
    expect(a).toEqual(b);
  });
});

describe('formatInterval / startOfLocalDay', () => {
  it('formats intervals compactly', () => {
    expect([0, 30_000, 10 * MIN, 90 * MIN, 5 * 3_600_000, 2 * DAY, 45 * DAY, 400 * DAY].map(formatInterval))
      .toEqual(['1m', '1m', '10m', '2h', '5h', '2d', '2mo', '1.1y']);
  });
  it('startOfLocalDay returns local midnight', () => {
    const noon = new Date(2026, 5, 10, 15, 30).getTime();
    const d = new Date(startOfLocalDay(noon));
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 5, 10, 0, 0]);
  });
});
