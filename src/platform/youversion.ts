import { sourceFor, type BibleSource, type SourceDetails } from '../domain/bible/sources';
import { usfmBook, usfmPassages } from '../domain/bible/usfm';

/**
 * Fetches Bible text from the YouVersion Platform (https://developers.youversion.com): GET /v1/bibles/{id}/passages/{USFM},
 * with the app's key in the X-YVP-App-Key header. The key is bundled into the app (like the Firebase config); what it may read
 * is decided by the licenses accepted for it in the Platform portal.
 */
export type PassageProblem = 'not-configured' | 'offline' | 'not-found' | 'not-allowed' | 'busy' | 'failed';
export class PassageError extends Error {
  readonly problem: PassageProblem;
  constructor(problem: PassageProblem) { super(`YouVersion: ${problem}`); this.problem = problem; }
}

export interface PassageSource {
  /** Is there a key (or a stand-in) to ask with? */
  available(): boolean;
  /** The text of a reference ("Philippians 4:6-7", in either language) in a translation. Rejects with a PassageError. */
  fetchPassage(source: BibleSource, reference: string): Promise<string>;
  /** The publisher's own notice for one version. */
  details(id: number): Promise<SourceDetails>;
}

const BASE = 'https://api.youversion.com/v1';
const TIMEOUT_MS = 15_000;

function realSource(key: string | undefined): PassageSource {
  const lengths = new Map<string, Promise<number>>(); // how many verses a chapter has, asked once per session

  async function get(path: string, attempt = 0): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, { headers: { 'X-YVP-App-Key': key!, Accept: 'application/json' }, signal: controller.signal });
    } catch {
      throw new PassageError('offline'); // no connection, or too slow
    } finally {
      clearTimeout(timer);
    }
    if (response.status === 429 && attempt < 2) { // asked too often: wait as long as they say, then once more
      const wait = Math.min(Number(response.headers.get('Retry-After')) || 1, 5);
      await new Promise((r) => setTimeout(r, wait * 1000));
      return get(path, attempt + 1);
    }
    if (response.status === 404 || response.status === 400 || response.status === 422) throw new PassageError('not-found');
    if (response.status === 401 || response.status === 403 || response.status === 412) throw new PassageError('not-allowed');
    if (response.status === 429) throw new PassageError('busy');
    if (!response.ok) throw new PassageError('failed');
    try { return await response.json(); } catch { throw new PassageError('failed'); }
  }

  const lastVerse = (yvId: number, book: string, chapter: number) => {
    const code = usfmBook(book);
    if (!code) return Promise.reject(new PassageError('not-found'));
    const id = `${yvId}/${code}/${chapter}`;
    if (!lengths.has(id)) {
      const count = get(`/bibles/${yvId}/books/${code}/chapters/${chapter}/verses`).then((r) => {
        const data = (r as { data?: unknown[] }).data;
        if (!Array.isArray(data) || data.length === 0) throw new PassageError('failed');
        return data.length;
      });
      count.catch(() => lengths.delete(id)); // a failure is not remembered
      lengths.set(id, count);
    }
    return lengths.get(id)!;
  };

  return {
    available: () => !!key,
    async details(id) {
      if (!key) throw new PassageError('not-configured');
      const r = (await get(`/bibles/${id}`)) as { copyright?: unknown; publisher_url?: unknown };
      return { copyright: typeof r.copyright === 'string' ? r.copyright : null, publisherUrl: typeof r.publisher_url === 'string' ? r.publisher_url : null };
    },
    async fetchPassage(source, reference) {
      if (!key) throw new PassageError('not-configured');
      const pieces = await usfmPassages(reference, (book, chapter) => lastVerse(source.yvId, book, chapter));
      if (!pieces) throw new PassageError('not-found');
      const texts: string[] = [];
      for (const piece of pieces) {
        const r = (await get(`/bibles/${source.yvId}/passages/${piece}`)) as { content?: unknown };
        if (typeof r.content !== 'string' || !r.content.trim()) throw new PassageError('not-found');
        texts.push(r.content.trim());
      }
      return texts.join(' ');
    },
  };
}

// ---- Tests ---------------------------------------------------------------------------------------------------------------
/** Browser tests only (VITE_FAKE_YOUVERSION=true): never touches the network; makes up a text for any reference it is asked about. */
export interface FakeYouVersion {
  /** Every (translation, reference) asked for, in order. */
  asked: { code: string; reference: string }[];
  /** What the next requests do instead of working: 'offline', 'not-found'... (one entry each, in order). */
  failWith: PassageProblem[];
  /** Wait this long before answering (ms). */
  delayMs: number;
}
function fakeSource(): PassageSource {
  const state: FakeYouVersion = (window as unknown as { __fakeYouVersion?: FakeYouVersion }).__fakeYouVersion ?? { asked: [], failWith: [], delayMs: 0 };
  (window as unknown as { __fakeYouVersion: FakeYouVersion }).__fakeYouVersion = state;
  return {
    available: () => true,
    async details(id) {
      return { copyright: `Copyright of version ${id}`, publisherUrl: null };
    },
    async fetchPassage(source, reference) {
      state.asked.push({ code: source.code, reference });
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      const problem = state.failWith.shift();
      if (problem) throw new PassageError(problem);
      if (!sourceFor(source.code)) throw new PassageError('not-found');
      return `Fake ${source.code} text of ${reference}.`;
    },
  };
}

let source: PassageSource | undefined;
export function getPassageSource(): PassageSource {
  source ??= import.meta.env.VITE_FAKE_YOUVERSION === 'true' ? fakeSource() : realSource(import.meta.env.VITE_YOUVERSION_APP_KEY);
  return source;
}

/** Test hook: a source built from a key and fetch, so the real one can be tried without a browser. */
export const createPassageSource = realSource;
