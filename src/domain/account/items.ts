import { fingerprint } from '../../features/sharing/fingerprint';

/**
 * What is kept in a person's account: their decks, their cards (and which deck each is in), the study schedule of each
 * card, and a few study settings. Review history is not kept. Each thing is one "item" with a fixed shape, so two devices
 * can compare them: the one changed most recently wins.
 */
export type Entity = 'deck' | 'card' | 'schedule' | 'setting';
/** Decks first, then cards (which point at decks), then schedules (which point at cards). */
export const ENTITY_ORDER: Entity[] = ['deck', 'card', 'schedule', 'setting'];
/** Only study settings follow the account; how the app looks (theme, font, language) stays per device. */
export const SETTING_KEYS = ['new_cards_per_day', 'card_kinds', 'blank_difficulty'] as const;
export const CARD_KINDS = ['recall', 'identify'] as const;

export type Doc = Record<string, string | number | boolean | null | { deckId: string; addedAt: number }[]>;
export interface Item { entity: Entity; id: string; updatedAt: number; doc: Doc; hash: string }

export const itemKey = (entity: Entity, id: string) => `${entity}~${id}`;
export function parseKey(key: string): { entity: Entity; id: string } | null {
  const i = key.indexOf('~');
  const entity = key.slice(0, i) as Entity;
  return i > 0 && ENTITY_ORDER.includes(entity) && i < key.length - 1 ? { entity, id: key.slice(i + 1) } : null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : typeof v === 'string' ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : num(v));
const has = (o: Record<string, unknown>) => !Object.values(o).includes(undefined);

/**
 * Puts an item's data into its one canonical shape (fixed fields, fixed order), or returns null if it does not look right
 * (so something odd in the account can never crash or corrupt this device). The same function is used for what is on the
 * device and what comes from the account, so their fingerprints can be compared.
 */
export function canonical(entity: Entity, id: string, raw: unknown): Doc | null {
  if (!isObj(raw)) return null;
  let doc: Record<string, unknown>;
  if (entity === 'deck') {
    doc = { title: str(raw.title), description: strOrNull(raw.description), translation: strOrNull(raw.translation), language: strOrNull(raw.language), publishId: strOrNull(raw.publishId), importedFrom: strOrNull(raw.importedFrom), createdAt: num(raw.createdAt), updatedAt: num(raw.updatedAt) };
  } else if (entity === 'card') {
    const decks = Array.isArray(raw.decks)
      ? raw.decks.map((d) => (isObj(d) && str(d.deckId) !== undefined && num(d.addedAt) !== undefined ? { deckId: d.deckId as string, addedAt: d.addedAt as number } : undefined))
      : undefined;
    doc = { reference: str(raw.reference), verseText: str(raw.verseText), note: strOrNull(raw.note), createdAt: num(raw.createdAt), updatedAt: num(raw.updatedAt), decks: decks && !decks.includes(undefined) ? [...(decks as { deckId: string; addedAt: number }[])].sort((a, b) => (a.deckId < b.deckId ? -1 : a.deckId > b.deckId ? 1 : 0)) : undefined };
  } else if (entity === 'schedule') {
    const kind = str(raw.kind);
    doc = {
      cardId: str(raw.cardId), kind: kind && (CARD_KINDS as readonly string[]).includes(kind) ? kind : undefined,
      due: num(raw.due), stability: num(raw.stability), difficulty: num(raw.difficulty), state: num(raw.state), reps: num(raw.reps), lapses: num(raw.lapses),
      learningSteps: num(raw.learningSteps), scheduledDays: num(raw.scheduledDays), lastReview: numOrNull(raw.lastReview), version: str(raw.version), updatedAt: num(raw.updatedAt),
    };
    if (doc.cardId !== undefined && itemKey('schedule', `${doc.cardId}~${doc.kind}`) !== itemKey('schedule', id)) return null;
  } else {
    const value = typeof raw.value === 'string' || typeof raw.value === 'number' ? raw.value : undefined;
    doc = { key: str(raw.key), value, updatedAt: num(raw.updatedAt) };
    if (!(SETTING_KEYS as readonly string[]).includes(doc.key as string) || doc.key !== id) return null;
  }
  return has(doc) ? (doc as Doc) : null;
}

export const hashOf = (doc: Doc) => fingerprint(JSON.stringify(doc));

export function makeItem(entity: Entity, id: string, raw: unknown): Item | null {
  const doc = canonical(entity, id, raw);
  return doc ? { entity, id, doc, updatedAt: doc.updatedAt as number, hash: hashOf(doc) } : null;
}

/** Which of two versions of the same thing wins: the one changed most recently; if exactly equal, the larger fingerprint (so every device picks the same). */
export function remoteWins(remote: { updatedAt: number; hash: string }, local: { updatedAt: number; hash: string }): boolean {
  return remote.updatedAt !== local.updatedAt ? remote.updatedAt > local.updatedAt : remote.hash > local.hash;
}
