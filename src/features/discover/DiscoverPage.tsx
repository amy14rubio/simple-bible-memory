import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListFilter, Search } from 'lucide-react';
import { AppBar, BackButton, Button, EmptyState, ErrorMessage, IconButton, Page, SearchBar } from '../../components/ui';
import { loadBackends, sharingAvailable } from '../sharing/backend';
import { useI18n } from '../../i18n/I18nProvider';
import { NO_FILTERS, type DiscoverFilters, type PublicDeck } from './types';
import { deckSummary } from './names';
import { FilterDrawer } from './FilterDrawer';

/**
 * Discover Decks: the public catalogue, newest first. Search matches the start of a title; the filter narrows by language
 * and translation. Results come a page at a time. Nobody needs to be signed in.
 */
export function DiscoverPage() {
  const { t } = useI18n();
  const available = sharingAvailable();
  const [filters, setFilters] = useState<DiscoverFilters>(NO_FILTERS);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [decks, setDecks] = useState<PublicDeck[]>([]);
  const [cursor, setCursor] = useState<unknown | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);
  const request = useRef(0); // only the newest request may change the screen

  const search = useDebounced(query, 350);
  const active: DiscoverFilters = { ...filters, query: search };

  const load = useCallback(async (f: DiscoverFilters, after?: unknown) => {
    const mine = ++request.current;
    if (after === undefined) setState('loading'); else setMore(true);
    try {
      const page = await (await loadBackends()).discover.listDecks(f, after);
      if (mine !== request.current) return;
      setDecks((d) => (after === undefined ? page.decks : [...d, ...page.decks]));
      setCursor(page.cursor);
      setState('ready');
    } catch {
      if (mine === request.current) setState('error');
    } finally {
      if (mine === request.current) setMore(false);
    }
  }, []);

  useEffect(() => { if (available) void load(active); }, [available, filters.language, filters.translation, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterButton = (
    <IconButton label={t('discover.filter')} onClick={() => setFiltering(true)}>
      <span className="relative">
        <ListFilter size={20} aria-hidden />
        {(filters.language !== 'all' || filters.translation !== 'all') && <span aria-hidden className="absolute -right-1 -top-1 size-2 rounded-full bg-accent" />}
      </span>
    </IconButton>
  );
  const heading = search.trim() ? t('discover.results') : t('discover.newest');

  return (
    <>
      {searching ? (
        <SearchBar label={t('discover.search')} placeholder={t('discover.search')} value={query} onChange={setQuery} backLabel={t('browse.searchClose')} onClose={() => { setSearching(false); setQuery(''); }} actions={filterButton} />
      ) : (
        <AppBar
          title={t('discover.title')}
          back={<BackButton to="/" label={t('common.back')} />}
          actions={<><IconButton label={t('discover.search')} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>{filterButton}</>}
        />
      )}

      {!available ? (
        <EmptyState title={t('discover.unavailable')}>{null}</EmptyState>
      ) : (
        <Page className="space-y-4 pt-4">
          <h2 className="font-serif text-xl">{heading}</h2>
          {state === 'loading' && <p role="status" className="text-muted">{t('discover.loading')}</p>}
          {state === 'error' && (
            <div className="space-y-3">
              <ErrorMessage error={t('discover.error')} />
              <Button variant="secondary" onClick={() => void load(active)}>{t('discover.retry')}</Button>
            </div>
          )}
          {state === 'ready' && decks.length === 0 && (
            <p className="py-6 text-center text-muted">{search.trim() || filters.language !== 'all' || filters.translation !== 'all' ? t('discover.noMatch') : `${t('discover.empty')} ${t('discover.emptyBody')}`}</p>
          )}
          {state === 'ready' && decks.length > 0 && (
            <ul className="-mx-5">
              {decks.map((d) => (
                <li key={d.id} className="border-b border-border">
                  <Link to={`/discover/${d.id}`} className="block px-5 py-4 hover:bg-surface">
                    <span className="block font-serif text-lg leading-snug">{d.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{deckSummary(d, t('translation.own'), t('import.cards', { count: d.cardCount }))}</span>
                    {d.description && <span className="mt-1 block line-clamp-2 text-[0.9375rem] text-muted">{d.description}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {state === 'ready' && cursor !== null && <Button variant="secondary" className="w-full" disabled={more} onClick={() => void load(active, cursor)}>{t('discover.loadMore')}</Button>}
        </Page>
      )}

      <FilterDrawer open={filtering} onClose={() => setFiltering(false)} filters={filters} onChange={setFilters} />
    </>
  );
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}
