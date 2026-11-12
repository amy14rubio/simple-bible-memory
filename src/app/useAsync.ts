import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * What a screen showed last time, by name. A screen that asks for a `cacheKey` shows this at once when it opens (and loads the fresh data in the
 * background), so it slides in complete instead of empty, and nothing waits.
 */
const cache = new Map<string, unknown>();
export const primeCache = (key: string, data: unknown) => { cache.set(key, data); };

/** Tiny data-loading hook (think: fetch-on-mount with a reload handle). */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[], cacheKey?: string) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>(() => (cacheKey && cache.has(cacheKey) ? { data: cache.get(cacheKey) as T, loading: false } : { loading: true }));
  const [tick, setTick] = useState(0);
  const quiet = useRef(false); // a refresh keeps showing the old data until the new arrives, instead of blanking the screen

  useEffect(() => {
    let cancelled = false;
    if (cacheKey && cache.has(cacheKey)) setState({ data: cache.get(cacheKey) as T, loading: false }); // what it showed last time, until the fresh data arrives
    else if (!quiet.current) setState((s) => ({ ...s, loading: true }));
    quiet.current = false;
    load().then(
      (data) => { if (cacheKey) cache.set(cacheKey, data); if (!cancelled) setState({ data, loading: false }); },
      (e) => !cancelled && setState({ error: e instanceof Error ? e : new Error(String(e)), loading: false }),
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  /** Loads again without blanking the screen: for changes that arrive while someone is looking at it. */
  const refresh = useCallback(() => { quiet.current = true; setTick((t) => t + 1); }, []);
  return { ...state, reload, refresh };
}
