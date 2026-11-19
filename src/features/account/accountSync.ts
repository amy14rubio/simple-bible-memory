import type { AccountRepository } from '../../data/repositories/accountRepository';
import { ENTITY_ORDER, NEWER, SCHEMA_VERSION, itemKey, parseKey, remoteWins, makeItem, type Doc, type Entity } from '../../domain/account/items';
import type { AccountBackend, AccountStatus, OutItem, RemoteItem } from './types';

/**
 * Keeps the person's decks, cards and study schedules in step with their account, with no buttons to press.
 *
 *  - Sending: the device remembers a fingerprint of everything it last agreed with the account. Anything that differs
 *    (new, changed) is sent; anything remembered but now gone was deleted here, so a "deleted" stub is sent.
 *  - Receiving: the account tells us about changes (the ones from other devices, live). For each, the version changed
 *    most recently wins; the loser is replaced (or, if it is ours, sent again).
 *  - Offline is normal: nothing is lost, the work is simply done once there is a connection.
 * Review history is not part of this.
 */
const CHUNK = 400; // Firestore allows 500 writes per batch
const FULL_READ_EVERY_MS = 24 * 60 * 60 * 1000;
/** Marks, in the "last agreed" record, an item the account refused ("refused:" + its fingerprint): it is not sent again until it changes or the app is opened again. */
const REFUSED = 'refused:';
/** How many refused things are named in the status (the rest are counted). */
const MAX_NAMED = 10;

export type AccountChoice = 'merge' | 'replace';

export interface AccountSync {
  /**
   * Call after sign-in. 'ready' means syncing can start; 'ask' means this device holds decks from a different account,
   * so the person must choose (see `resolve`).
   */
  prepare(uid: string): Promise<'ready' | 'ask'>;
  /** Settles the 'ask': add this device's decks to the account, or replace them with the account's. */
  resolve(uid: string, choice: AccountChoice): Promise<void>;
  start(uid: string): Promise<void>;
  /** Stops syncing (signed out). Nothing is deleted. */
  stop(): void;
  /** Listens to the account again from where this device left off (used when the connection was lost, the network is back, or the app comes to the front). */
  reconnect(): void;
  /** Sends what has changed, now. Never throws: problems become the 'waiting' status. */
  syncAll(): Promise<void>;
  /** Same, a moment from now, so a burst of edits is sent once. */
  schedule(): void;
  /** Deletes the account's copy of everything and forgets this device was linked (used when the account is deleted). */
  eraseAccountData(): Promise<void>;
  status(): AccountStatus;
  subscribe(callback: () => void): () => void;
  /** Resolves when everything queued so far has been done (for tests). */
  idle(): Promise<void>;
}

export function createAccountSync({ repo, backend, announce, online = () => (typeof navigator === 'undefined' || navigator.onLine !== false), delayMs = 1500, retryMs = 3000, now = Date.now, schemaVersion = SCHEMA_VERSION }: {
  repo: AccountRepository;
  /** Tells the rest of the app the database changed because of the account (screens refresh, public decks re-sync). */
  backend: AccountBackend;
  announce: () => void;
  online?: () => boolean;
  delayMs?: number;
  /** How long to wait before listening again after the connection failed (it doubles each time, up to a minute). */
  retryMs?: number;
  now?: () => number;
  /** The item format this app understands (a different one only in tests). */
  schemaVersion?: number;
}): AccountSync {
  let uid: string | null = null;
  let stopListening: (() => void) | undefined;
  let state: AccountStatus = { state: 'off' };
  const listeners = new Set<() => void>();
  const setStatus = (s: AccountStatus) => { state = s; listeners.forEach((l) => l()); };

  // One thing at a time: receiving and sending never overlap.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  async function receive(incoming: RemoteItem[]) {
    const agreed = await repo.agreed();
    // What was kept aside earlier (it arrived before what it belongs to) is looked at again together with what just arrived; of two versions of
    // one thing, the newer is used.
    const byKey = new Map<string, RemoteItem>();
    for (const it of [...(await repo.parked()), ...incoming]) {
      const k = itemKey(it.entity, it.id);
      const cur = byKey.get(k);
      if (!cur || it.updatedAt > cur.updatedAt || (it.updatedAt === cur.updatedAt && it.syncedAt >= cur.syncedAt)) byKey.set(k, it);
    }
    const sorted = [...byKey.values()].sort((a, b) => ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity));
    let applied = false;
    let cursor = 0;
    for (const it of sorted) {
      cursor = Math.max(cursor, it.syncedAt);
      const key = itemKey(it.entity, it.id);
      const was = agreed.get(key);
      const local = await repo.item(it.entity, it.id);

      if (it.deleted) {
        await repo.unpark(it.entity, it.id); // deleted on purpose somewhere: there is nothing left to wait for
        if (!local) { if (was) await repo.forget([key]); continue; }
        if (it.updatedAt >= local.updatedAt) { await repo.apply(it.entity, it.id, null); await repo.forget([key]); applied = true; }
        else await repo.forget([key]); // edited here after it was deleted elsewhere: the edit wins and is sent again
        continue;
      }

      // Saved by a newer app, in a format this one does not understand: leave it completely alone (not read, not replaced,
      // not deleted), and remember that, so nothing this device sends can damage it. It is read after this app is updated.
      if (it.v > schemaVersion) { await repo.setAgreed([{ key, hash: NEWER + it.v, updatedAt: it.updatedAt }]); continue; }

      const remote = makeItem(it.entity, it.id, it.data);
      if (!remote) continue;

      // An item that arrives before what it belongs to (a card before its collection, a schedule before its card) is never thrown away: it is kept
      // aside, and put in place as soon as what it belongs to is here. Only a deliberate deletion removes anything.
      const fits = await repo.parents(it.entity, remote.doc);
      // (Also when the card is here already and the account says it moved to a collection that is not here yet: it stays where it is until that arrives.)
      if (fits === 'none' && (!local || (local.hash !== remote.hash && remoteWins(remote, local)))) { await repo.park(it); continue; }

      if (!local) {
        if (was && remote.updatedAt <= was.updatedAt) continue; // deleted here, and the account has nothing newer: the deletion is sent next
        await repo.apply(it.entity, it.id, remote.doc);
        applied = true;
      } else if (local.hash === remote.hash) {
        await repo.setAgreed([{ key, hash: local.hash, updatedAt: local.updatedAt }]);
        await repo.unpark(it.entity, it.id);
        continue;
      } else if (remoteWins(remote, local)) {
        await repo.apply(it.entity, it.id, remote.doc);
        applied = true;
      } else {
        await repo.forget([key]); // ours is newer: make sure it is sent
        await repo.unpark(it.entity, it.id);
        continue;
      }
      // Put in place. A card whose collections are only partly here is filed in those now and kept aside for the rest, so it joins them when they arrive.
      if (fits === 'all') await repo.unpark(it.entity, it.id); else await repo.park(it);
      const after = await repo.item(it.entity, it.id);
      if (after) await repo.setAgreed([{ key, hash: after.hash, updatedAt: after.updatedAt }]); else await repo.forget([key]);
    }
    if (uid && cursor > 0) {
      const have = Number((await repo.getMeta(`cursor:${uid}`)) ?? 0);
      if (cursor > have) await repo.setMeta(`cursor:${uid}`, String(cursor));
    }
    if (applied) announce();
  }

  const DELETED = 'deleted';

  /**
   * Notices what was deleted on this device and notes WHEN, even with no connection, so a deletion made offline is not
   * later mistaken for being newer than an edit made on another device in the meantime.
   */
  async function noteDeletions() {
    const live = new Set((await repo.items()).map((i) => itemKey(i.entity, i.id)));
    const gone: { key: string; hash: string; updatedAt: number }[] = [];
    const forgotten: string[] = [];
    for (const [key, st] of await repo.agreed()) {
      if (live.has(key)) continue;
      if (st.hash.startsWith(NEWER)) continue; // held for a newer app: not ours to delete
      const parsed = parseKey(key);
      // Missing from the backed-up list is not the same as deleted: a card that has lost its link to a collection is still on the device. Only a thing that
      // is really gone counts, so nothing is ever reported to the account as deleted by accident.
      if (parsed && (await repo.rowExists(parsed.entity, parsed.id))) continue;
      if (!parsed || parsed.entity === 'setting') forgotten.push(key);
      else if (parsed.entity === 'schedule') forgotten.push(key); // goes when its card goes: nothing to send
      else if (st.hash !== DELETED) gone.push({ key, hash: DELETED, updatedAt: now() });
    }
    if (gone.length) await repo.setAgreed(gone);
    if (forgotten.length) await repo.forget(forgotten);
  }

  /** An item the account would not take, named for the person (a card by its verse reference, a collection by its name). */
  type Refused = { entity: Entity; name: string };
  const describe = (entity: Entity, doc: Doc | null): Refused => ({
    entity,
    name: String((entity === 'deck' ? doc?.title : entity === 'card' ? doc?.reference : '') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
  });

  async function send(): Promise<Refused[]> {
    const items = await repo.items();
    const agreed = await repo.agreed();
    const out: (OutItem & { hash?: string })[] = [];
    const refused: Refused[] = [];
    for (const i of items) {
      const was = agreed.get(itemKey(i.entity, i.id))?.hash;
      if (was?.startsWith(NEWER)) continue; // the account holds a newer format of this: never overwrite it
      if (was === REFUSED + i.hash) { refused.push(describe(i.entity, i.doc)); continue; } // refused before and unchanged since: not sent again (until the app is opened again)
      if (was !== i.hash) out.push({ entity: i.entity, id: i.id, deleted: false, updatedAt: i.updatedAt, v: schemaVersion, doc: i.doc, hash: i.hash });
    }
    const live = new Set(items.map((i) => itemKey(i.entity, i.id)));
    for (const [key, st] of agreed) {
      const parsed = parseKey(key);
      if (parsed && st.hash === DELETED && !live.has(key)) out.push({ entity: parsed.entity, id: parsed.id, deleted: true, updatedAt: st.updatedAt, v: schemaVersion, doc: null });
    }
    out.sort((a, b) => ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity));
    for (let i = 0; i < out.length; i += CHUNK) {
      const chunk = out.slice(i, i + CHUNK);
      const { stale, refused: no = [] } = await backend.push(chunk.map(({ hash: _h, ...rest }) => rest));
      const notSent = new Set([...stale, ...no]);
      const sent = chunk.filter((c) => !notSent.has(itemKey(c.entity, c.id)));
      await repo.setAgreed(sent.filter((c) => !c.deleted).map((c) => ({ key: itemKey(c.entity, c.id), hash: c.hash!, updatedAt: c.updatedAt })));
      await repo.forget(sent.filter((c) => c.deleted).map((c) => itemKey(c.entity, c.id)));
      // The account would not take these. They are set aside (and said so), and everything else carries on: one item must never stop the backup of all the others.
      const turnedDown = chunk.filter((c) => no.includes(itemKey(c.entity, c.id)) && !c.deleted);
      await repo.setAgreed(turnedDown.map((c) => ({ key: itemKey(c.entity, c.id), hash: REFUSED + c.hash!, updatedAt: c.updatedAt })));
      for (const c of turnedDown) refused.push(describe(c.entity, c.doc));
    }
    return refused;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;

  /** Listens to the account from `since`. If the connection fails, it is not left dead: it listens again after a pause (a longer one each time). */
  function listenFrom(since: number) {
    stopListening?.();
    stopListening = backend.listen(
      since,
      (items) => { failures = 0; void exclusive(() => receive(items)).catch(() => setStatus({ state: 'waiting' })); },
      () => {
        setStatus({ state: 'waiting' });
        clearTimeout(retry);
        const delay = Math.min(60_000, retryMs * 2 ** Math.min(failures++, 6));
        retry = setTimeout(() => { void engine.reconnect(); }, delay);
      },
    );
  }

  const engine: AccountSync = {
    async prepare(next) {
      const owner = await repo.getMeta('owner');
      if (owner === next) return 'ready';
      if (owner === undefined || !(await repo.hasDecks())) {
        // First time here, or nothing on the device to mix up: link it to this account.
        if (owner !== undefined) await repo.resetAgreed();
        await repo.setMeta('owner', next);
        return 'ready';
      }
      return 'ask';
    },

    async resolve(next, choice) {
      if (choice === 'replace') await repo.wipe();
      else await repo.resetAgreed(); // everything here counts as new to this account, so all of it is sent
      await repo.setMeta('owner', next);
    },

    async start(next) {
      stopListening?.();
      uid = next;
      setStatus({ state: 'syncing' });
      // After an update, items an older version could not read are now understood: forget that they were held and listen from
      // the start once, so they arrive.
      const held = [...(await repo.agreed())].filter(([, st]) => st.hash.startsWith(NEWER) && Number(st.hash.slice(NEWER.length)) <= schemaVersion);
      if (held.length) { await repo.forget(held.map(([key]) => key)); await repo.setMeta(`cursor:${next}`, '0'); }
      // Normally only what changed since the last look is asked for. But a device must never stay without something the account has, so once a day
      // (and the first time after this was added) it asks for everything again; what it already has is simply recognised and left alone.
      const lastFull = await repo.getMeta(`fullpull:${next}`);
      const fullDue = lastFull === undefined || now() - Number(lastFull) > FULL_READ_EVERY_MS;
      if (fullDue) await repo.setMeta(`fullpull:${next}`, String(now()));
      // Things the account refused are tried once more each time the app is opened (the rules, or the thing itself, may have changed).
      const tryAgain = [...(await repo.agreed())].filter(([, st]) => st.hash.startsWith(REFUSED)).map(([key]) => key);
      if (tryAgain.length) await repo.forget(tryAgain);
      const since = fullDue ? 0 : Number((await repo.getMeta(`cursor:${next}`)) ?? 0);
      failures = 0;
      listenFrom(since);
      await engine.syncAll();
    },

    reconnect() {
      if (!uid) return;
      clearTimeout(retry);
      const current = uid;
      void repo.getMeta(`cursor:${current}`).then((c) => { if (uid === current) listenFrom(Number(c ?? 0)); });
    },

    stop() {
      clearTimeout(timer);
      clearTimeout(retry);
      stopListening?.();
      stopListening = undefined;
      uid = null;
      setStatus({ state: 'off' });
    },

    syncAll() {
      if (!uid) return Promise.resolve();
      return exclusive(async () => {
        if (!uid) return;
        await noteDeletions();
        if (!online()) { setStatus({ state: 'waiting' }); return; }
        setStatus({ state: 'syncing' });
        try {
          const refused = await send();
          setStatus({ state: 'synced', at: now(), ...(refused.length ? { refused: { count: refused.length, examples: refused.slice(0, MAX_NAMED) } } : {}) });
        }
        catch { setStatus({ state: 'waiting' }); }
      });
    },

    schedule() {
      if (!uid) return;
      clearTimeout(timer);
      timer = setTimeout(() => { void engine.syncAll(); }, delayMs);
    },

    async eraseAccountData() {
      await backend.removeAll();
      engine.stop();
      await repo.resetAgreed();
      await repo.setMeta('owner', null);
    },

    status: () => state,
    subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    idle: () => chain.then(() => undefined),
  };
  return engine;
}

export type { Entity };
