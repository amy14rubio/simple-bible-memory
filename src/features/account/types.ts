import type { Doc, Entity } from '../../domain/account/items';

/** One thing as it arrives from the account. `data` is untrusted: it is checked before it touches the database. */
export interface RemoteItem { entity: Entity; id: string; deleted: boolean; updatedAt: number; syncedAt: number; /** The format version it was saved in (1 if it was saved before versions existed). */ v: number; data: unknown }
/** One thing on its way to the account. A deleted thing is sent as a stub with no data. */
export interface OutItem { entity: Entity; id: string; deleted: boolean; updatedAt: number; /** The format version this device saves in. */ v: number; doc: Doc | null }

/**
 * The person's private area in the cloud. Real one: Firestore (`users/{uid}/items`). Fake one: in the browser, for tests.
 * The cloud refuses to replace an item with an older version of it, so when two devices disagree the newer edit wins
 * no matter which device sends first.
 */
export interface AccountBackend {
  /**
   * Calls back with every item changed at or after `since` (a time the cloud gave out), then with each later change as it
   * happens. Returns a function that stops listening.
   */
  listen(since: number, onItems: (items: RemoteItem[]) => void, onError: (error: unknown) => void): () => void;
  /** Sends items. `stale` lists the ones the cloud refused because it already has a newer version ("entity~id"). Throws if the network is down. */
  push(items: OutItem[]): Promise<{ stale: string[] }>;
  /** Removes everything in the person's private area (used when they delete their account). */
  removeAll(): Promise<void>;
}

export type AccountStatus =
  | { state: 'off' } // not signed in
  | { state: 'syncing' }
  | { state: 'synced'; at: number }
  | { state: 'waiting' }; // offline, or something went wrong: it will try again
