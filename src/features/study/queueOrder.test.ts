import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/types';
import type { Schedule } from '../../domain/scheduling/scheduler';
import { orderForToday, promoteDue, shuffle, type SessionEntry } from './queueOrder';

const entry = (id: string, due: number | null, again = false): SessionEntry => ({
  card: { id } as Card,
  kind: 'recall',
  schedule: due === null ? null : ({ due } as Schedule),
  again,
});
const ids = (q: SessionEntry[]) => q.map((e) => e.card.id);

describe('shuffle', () => {
  it('keeps every item exactly once and does not change the original', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(items);
    expect([...out].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('is a real shuffle: the order follows the random numbers', () => {
    expect(shuffle([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1]);
    expect(shuffle([1, 2, 3, 4], () => 0.999)).toEqual([1, 2, 3, 4]);
  });
  it('handles empty and single lists', () => {
    expect(shuffle([])).toEqual([]);
    expect(shuffle(['a'])).toEqual(['a']);
  });
});

describe('promoteDue', () => {
  const now = 1_000_000;
  it('brings a card forward once its time is up, ahead of the rest', () => {
    const q = [entry('current', 1), entry('a', 5), entry('b', 5), entry('again', now - 10, true)];
    expect(ids(promoteDue(q, 1, now))).toEqual(['current', 'again', 'a', 'b']);
  });
  it('leaves a card that is not due yet at the back', () => {
    const q = [entry('current', 1), entry('a', 5), entry('again', now + 60_000, true)];
    expect(promoteDue(q, 1, now)).toBe(q);
  });
  it('picks the one that has waited longest when several are due', () => {
    const q = [entry('current', 1), entry('a', 5), entry('late', now - 5, true), entry('early', now - 500, true)];
    expect(ids(promoteDue(q, 1, now))).toEqual(['current', 'early', 'a', 'late']);
  });
  it('never moves a card that was simply due at the start of the session', () => {
    const q = [entry('current', 1), entry('a', now - 1000), entry('b', now - 2000)];
    expect(promoteDue(q, 1, now)).toBe(q);
  });
  it('does nothing when the due card is already next, or the queue is over', () => {
    const q = [entry('current', 1), entry('again', now - 1, true)];
    expect(promoteDue(q, 1, now)).toBe(q);
    expect(promoteDue(q, 5, now)).toBe(q);
  });
});

describe('orderForToday', () => {
  const now = 1_000_000;
  const mk = (id: string, due: number | null, kind: 'recall' | 'identify' = 'recall') => ({ card: { id } as Card, kind, schedule: due === null ? null : ({ due } as Schedule) });
  const many = Array.from({ length: 12 }, (_, i) => mk(`c${i}`, null));
  const ids = (q: { card: Card; kind: string }[]) => q.map((e) => `${e.card.id}:${e.kind}`);
  const today = { deckId: 'deck', day: 20_000, now };

  it('is the same every time it is asked for on the same day (the same in every study mode)', () => {
    expect(ids(orderForToday(many, today))).toEqual(ids(orderForToday([...many].reverse(), today)));
  });
  it('keeps the remaining cards in the same order as cards are finished and drop out', () => {
    const full = ids(orderForToday(many, today));
    const left = many.filter((e) => !['c0', 'c3', 'c7'].includes(e.card.id));
    expect(ids(orderForToday(left, today))).toEqual(full.filter((k) => !['c0:recall', 'c3:recall', 'c7:recall'].includes(k)));
  });
  it('is a different order on another day or for another deck, and not the order the cards were added in', () => {
    const base = ids(orderForToday(many, today));
    expect(ids(orderForToday(many, { ...today, day: 20_001 }))).not.toEqual(base);
    expect(ids(orderForToday(many, { ...today, deckId: 'other' }))).not.toEqual(base);
    expect(base).not.toEqual(ids(many));
    expect([...base].sort()).toEqual(ids(many).sort()); // every card, once
  });
  it('treats the two cards of a verse as separate cards in the shuffle', () => {
    const both = many.flatMap((e) => [e, { ...e, kind: 'identify' as const }]);
    const order = ids(orderForToday(both, today));
    expect(order).toHaveLength(24);
    expect(new Set(order).size).toBe(24);
  });
  it('puts cards being learned that are not due yet after the rest, soonest first, marked to come back when due', () => {
    const entries = [mk('learn-late', now + 600_000), ...many.slice(0, 4), mk('learn-soon', now + 60_000), mk('due', now - 5)];
    const q = orderForToday(entries, today);
    expect(ids(q).slice(-2)).toEqual(['learn-soon:recall', 'learn-late:recall']);
    expect(q.slice(-2).every((e) => e.again)).toBe(true);
    expect(q.slice(0, -2).some((e) => e.again)).toBe(false);
    expect(ids(q)).toContain('due:recall'); // a card that is simply due is in the first group
  });
});
