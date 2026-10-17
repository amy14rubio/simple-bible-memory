import { useCallback, useEffect, useRef, useState } from 'react';

/** Tiny data-loading hook (think: fetch-on-mount with a reload handle). */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const quiet = useRef(false); // a refresh keeps showing the old data until the new arrives, instead of blanking the screen

  useEffect(() => {
    let cancelled = false;
    if (!quiet.current) setState((s) => ({ ...s, loading: true }));
    quiet.current = false;
    load().then(
      (data) => !cancelled && setState({ data, loading: false }),
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
