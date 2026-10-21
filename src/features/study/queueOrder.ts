import type { QueueEntry } from '../../data/repositories/reviewRepository';

/** A card in the session: `again` marks one that was rated and comes back later in the same session (a learning step). */
export type SessionEntry = QueueEntry & { again?: boolean };

/** A random order (Fisher-Yates). The order of a study session: new and due cards mixed, so a verse's two cards are not put side by side on purpose. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  // Browser tests that expect cards in a fixed order set VITE_STABLE_ORDER; a test can turn shuffling back on with window.__randomOrder.
  if (import.meta.env.VITE_STABLE_ORDER === 'true' && !(globalThis as { __randomOrder?: boolean }).__randomOrder) return [...items];
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    [a[i], a[k]] = [a[k]!, a[i]!];
  }
  return a;
}

/**
 * Called as the session moves on to the card at `from`. A card rated Again/Hard/Good comes back when its time is up (a card
 * "due in 1 minute" is not saved for the end of the session): if one has come due, the one that has waited longest moves to
 * `from`. Cards not due yet stay at the back, and are shown early only when nothing else is left (like Anki's learn-ahead).
 */
export function promoteDue(queue: SessionEntry[], from: number, now: number): SessionEntry[] {
  let best = -1;
  for (let i = from; i < queue.length; i++) {
    const e = queue[i]!;
    if (e.again && e.schedule && e.schedule.due <= now && (best < 0 || e.schedule.due < queue[best]!.schedule!.due)) best = i;
  }
  if (best <= from) return queue; // none due, or already next
  const next = [...queue];
  const [picked] = next.splice(best, 1);
  next.splice(from, 0, picked!);
  return next;
}
