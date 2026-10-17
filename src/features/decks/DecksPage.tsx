import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EllipsisVertical, Search, Settings } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { useRefreshOnWrites } from '../../app/useRefreshOnWrites';
import { AppBar, ButtonLink, EmptyState, ErrorMessage, IconButton, IconLink, SearchBar } from '../../components/ui';
import { DeckMenu } from './DeckMenu';
import { loadCardKinds } from '../study/cardKinds';
import { loadNewPerDay } from '../study/newPerDay';
import { useI18n } from '../../i18n/I18nProvider';

export function DecksPage() {
  const { t } = useI18n();
  const { decks, reviews, settings } = useRepositories();
  const { data, error, loading, reload, refresh } = useAsync(async () => {
    const list = await decks.list();
    const due = await reviews.dueCounts({ newPerDay: await loadNewPerDay(settings), kinds: await loadCardKinds(settings) });
    return list.map((d) => ({ ...d, due: due[d.id] ?? 0 }));
  }, [decks, reviews, settings]);
  useRefreshOnWrites(refresh);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<{ id: string; title: string } | null>(null);

  const q = query.trim().toLowerCase();
  const shown = data?.filter((d) => d.title.toLowerCase().includes(q));

  return (
    <>
      {searching ? (
        <SearchBar label={t('decks.search')} placeholder={t('decks.search')} value={query} onChange={setQuery} backLabel={t('decks.searchClose')} onClose={() => { setSearching(false); setQuery(''); }} actions={<IconLink to="/settings" label={t('common.settings')}><Settings size={20} aria-hidden /></IconLink>} />
      ) : (
        <AppBar
          title={t('app.name')}
          actions={
            <>
              <IconButton label={t('decks.search')} onClick={() => setSearching(true)}><Search size={20} aria-hidden /></IconButton>
              <IconLink to="/settings" label={t('common.settings')}><Settings size={20} aria-hidden /></IconLink>
            </>
          }
        />
      )}
      {error && <div className="p-5"><ErrorMessage error={error} /></div>}
      {!loading && data?.length === 0 && (
        <EmptyState title={t('decks.emptyTitle')} action={<ButtonLink to="/decks/new">{t('decks.emptyAction')}</ButtonLink>}>
          {t('decks.emptyBody')}
        </EmptyState>
      )}
      {shown && data && data.length > 0 && shown.length === 0 && <p className="px-5 py-10 text-center text-muted">{t('decks.noMatch', { query })}</p>}
      <ul>
        {shown?.map((d) => (
          <li key={d.id} className="flex items-center border-b border-border pr-2">
            <Link to={`/decks/${d.id}`} className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-4 py-3 pl-5 pr-2 hover:bg-surface">
              <span className="truncate font-serif text-lg">{d.title}</span>
              <span className={`shrink-0 text-sm tabular-nums ${d.due > 0 ? 'font-semibold' : 'text-muted'}`}>
                {d.due}
                <span className="sr-only"> {t('decks.dueSuffix')}</span>{/* the screen shows just the number; screen readers also hear what it counts */}
              </span>
            </Link>
            <IconButton label={t('decks.actionsFor', { title: d.title })} onClick={() => setMenuFor(d)}><EllipsisVertical size={20} aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
      <DeckMenu deck={menuFor} onClose={() => setMenuFor(null)} onDeleted={reload} />
    </>
  );
}
