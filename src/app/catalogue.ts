import { useEffect, useState } from 'react';
import { CURATED_FONTS, type CatalogueFont } from '../lib/fonts/catalogue';
import { fetchCatalogue, loadCachedCatalogue, saveCatalogue } from '../lib/fonts/googleApi';

/** full: the whole catalogue. loading: fetching it. short: no API key, so the hand-picked list. unavailable: there is a key but Google could not be reached. */
let inFlight: Promise<CatalogueFont[]> | null = null; // one request at a time, however many components ask

export type CatalogueStatus = 'full' | 'loading' | 'short' | 'unavailable';

/**
 * The fonts to offer: the full Google Fonts list when there is an API key and the list could be loaded (or was loaded
 * within the last week), otherwise the short hand-picked list. Never fails: the worst case is the short list.
 */
export function useCatalogue(key: string | undefined = import.meta.env.VITE_GOOGLE_FONTS_API_KEY): { fonts: CatalogueFont[]; status: CatalogueStatus } {
  const [state, setState] = useState<{ fonts: CatalogueFont[]; status: CatalogueStatus }>(() => {
    const cached = key ? loadCachedCatalogue() : null;
    if (cached) return { fonts: cached.fonts, status: 'full' };
    return { fonts: CURATED_FONTS, status: key ? 'loading' : 'short' };
  });

  useEffect(() => {
    if (!key) return;
    const cached = loadCachedCatalogue();
    if (cached?.fresh) return;
    let cancelled = false;
    inFlight ??= fetchCatalogue(key).finally(() => { inFlight = null; });
    inFlight
      .then((fonts) => { saveCatalogue(fonts); if (!cancelled) setState({ fonts, status: 'full' }); })
      .catch(() => { if (!cancelled) setState((s) => (s.status === 'full' ? s : { fonts: CURATED_FONTS, status: 'unavailable' })); });
    return () => { cancelled = true; };
  }, [key]);

  return state;
}
