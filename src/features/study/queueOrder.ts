import type { QueueEntry } from '../../data/repositories/reviewRepository';
import { hashSeed } from '../../domain/study/cloze';

/** A card in the session: `again` marks one that was rated and comes back later in the same session (a learning step). */
export type SessionEntry = QueueEntry & { again?: boolean };

/** A random order (Fisher-Yates). The order of a study session: new and due cards mixed, so a verse's two cards are not put side by side on purpose. */
/** Browser tests that expect cards in a fixed order set VITE_STABLE_ORDER; a test can turn the real order back on with window.__randomOrder. */
const keepGivenOrder = () => import.meta.env.VITE_STABLE_ORDER === 'true' && !(globalThis as { __randomOrder?: boolean }).__randomOrder;

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  if (keepGivenOrder()) return [...items];
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

/** Spreads a hash over the whole range, so texts that differ in only a character or two still land far apart (the murmur3 finalizer). */
function spread(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The order of a deck's cards for today, the same in every study mode. It is a random-looking order that depends only on the day,
 * the deck and the card, so nothing has to be saved: leaving and coming back, or switching from Flashcard to Type, gives the cards
 * that are still left in the very same order. (A card done in one mode is simply no longer in the list in the others.)
 *
 * A verse's two cards (reference to passage, and passage to reference) are placed half a list apart, so they are never back to back
 * when the list has other verses to put between them (the second one would give the first one away), while fronts and backs of
 * different verses mix freely. Cards that are being learned and are not due for a few minutes yet go after the rest, soonest first,
 * as they do during a session.
 */
export function orderForToday(entries: readonly QueueEntry[], { deckId, day, now }: { deckId: string; day: number; now: number }): SessionEntry[] {
  // Both cards of a verse start from the same random point on a circle; one is moved half way round.
  const rank = (e: QueueEntry) => (spread(hashSeed(`${day}:${deckId}:${e.card.id}`)) / 2 ** 32 + (e.kind === 'identify' ? 0.5 : 0)) % 1;
  const ready = entries.filter((e) => !e.schedule || e.schedule.due <= now);
  if (!keepGivenOrder()) ready.sort((a, b) => rank(a) - rank(b) || (a.kind === 'recall' ? -1 : 1));
  // Waiting ones are marked `again`, so during the session they come back when their time is up (see promoteDue).
  const waiting = entries.filter((e) => e.schedule && e.schedule.due > now).sort((a, b) => a.schedule!.due - b.schedule!.due || rank(a) - rank(b)).map((e): SessionEntry => ({ ...e, again: true }));
  return [...ready, ...waiting];
}
