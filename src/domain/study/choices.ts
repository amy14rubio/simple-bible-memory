import { parseReference } from '../bible/reference';
import { hashSeed } from './cloze';

/** Seeded shuffle (mulberry32), so the same card shows the same options in a session. */
export function shuffleSeeded<T>(items: T[], seed: number): T[] {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const k = Math.floor(random() * (i + 1));
    [out[i], out[k]] = [out[k]!, out[i]!];
  }
  return out;
}

const key = (reference: string) => parseReference(reference)?.normalized ?? reference.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Near-miss references written in the SAME style as the correct one (same book text, same spacing),
 * so the wrong options do not give the answer away by looking different: John 3:16 -> John 3:17, John 3:15, John 4:16...
 */
export function nearMisses(reference: string): string[] {
  const m = /^(.*?[a-z.])(\s*)(\d[\d :,-]*)$/i.exec(reference.trim());
  if (!m || !parseReference(reference)) return [];
  const [, book, sep, passage] = m as unknown as [string, string, string, string];
  const compose = (p: string) => `${book}${sep}${p}`;
  const out: string[] = [];

  const verse = /^(\d+):(\d+)(?:-(\d+))?$/.exec(passage);
  if (verse) {
    const [chapter, v1, v2] = [Number(verse[1]), Number(verse[2]), verse[3] ? Number(verse[3]) : null];
    const span = v2 === null ? 0 : v2 - v1;
    const range = (start: number) => (span === 0 ? `${chapter}:${start}` : `${chapter}:${start}-${start + span}`);
    for (const d of [1, -1, 2, -2, 3, -3]) if (v1 + d >= 1) out.push(compose(range(v1 + d)));
    for (const d of [1, -1]) if (chapter + d >= 1) out.push(compose(v2 === null ? `${chapter + d}:${v1}` : `${chapter + d}:${v1}-${v2}`));
    return out;
  }
  const chapterOnly = /^(\d+)(?:-(\d+))?$/.exec(passage);
  if (chapterOnly) {
    const c1 = Number(chapterOnly[1]);
    const span = chapterOnly[2] ? Number(chapterOnly[2]) - c1 : 0;
    for (const d of [1, -1, 2, -2, 3, -3]) if (c1 + d >= 1) out.push(compose(span === 0 ? `${c1 + d}` : `${c1 + d}-${c1 + d + span}`));
  }
  return out;
}

/**
 * Multiple-choice citations for "which verse is this?". Wrong options come first from the learner's other cards
 * (plausible, and they are verses the learner is also learning), then from near-miss references.
 * Returns null when fewer than three options can be made, so the screen can fall back to typing.
 */
export function buildCitationChoices({ correct, others, seed, count = 4 }: { correct: string; others: string[]; seed: string; count?: number }): string[] | null {
  const taken = new Set([key(correct)]);
  const wrong: string[] = [];
  const add = (candidate: string) => {
    const k = key(candidate);
    if (wrong.length < count - 1 && !taken.has(k)) { taken.add(k); wrong.push(candidate); }
  };
  for (const o of shuffleSeeded(others, hashSeed(`${seed}:others`))) add(o);
  for (const n of shuffleSeeded(nearMisses(correct), hashSeed(`${seed}:near`))) add(n);
  if (wrong.length < 2) return null;
  return shuffleSeeded([correct, ...wrong], hashSeed(`${seed}:order`));
}
