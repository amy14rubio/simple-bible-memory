import { describe, expect, it } from 'vitest';
import type { Card } from '../../domain/types';
import type { Schedule } from '../../domain/scheduling/scheduler';
import { promoteDue, shuffle, type SessionEntry } from './queueOrder';

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
