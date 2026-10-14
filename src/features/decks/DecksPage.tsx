import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ellipsis, Search, Settings, X } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, ButtonLink, EmptyState, ErrorMessage, IconButton, IconLink } from '../../components/ui';
import { DeckMenu } from './DeckMenu';
import { loadCardKinds } from '../study/cardKinds';
import { loadNewPerDay } from '../study/newPerDay';

export function DecksPage() {
  const { decks, reviews, settings } = useRepositories();
  const { data, error, loading, reload } = useAsync(async () => {
    const list = await decks.list();
    const due = await reviews.dueCounts({ newPerDay: await loadNewPerDay(settings), kinds: await loadCardKinds(settings) });
    return list.map((d) => ({ ...d, due: due[d.id] ?? 0 }));
  }, [decks, reviews, settings]);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [menuFor, setMenuFor] = useState<{ id: string; title: string } | null>(null);

  const q = query.trim().toLowerCase();
  const shown = data?.filter((d) => d.title.toLowerCase().includes(q));

  return (
    <>
      <AppBar
        title="Simple Bible Memory"
        actions={
          <>
            <IconButton label={searching ? 'Close search' : 'Search decks'} aria-pressed={searching} onClick={() => { setSearching((s) => !s); setQuery(''); }}>
              {searching ? <X size={20} aria-hidden /> : <Search size={20} aria-hidden />}
            </IconButton>
            <IconLink to="/settings" label="Settings"><Settings size={20} aria-hidden /></IconLink>
          </>
        }
      />
      {searching && (
        <div className="border-b border-border px-5 py-2">
          <input
            aria-label="Search decks"
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search decks"
            className="w-full bg-transparent py-2 text-base placeholder:text-muted"
          />
        </div>
      )}
      {error && <div className="p-5"><ErrorMessage error={error} /></div>}
      {!loading && data?.length === 0 && (
        <EmptyState title="No decks yet" action={<ButtonLink to="/decks/new">Create your first deck</ButtonLink>}>
          A deck holds the verses you want to memorize.
        </EmptyState>
      )}
      {shown && data && data.length > 0 && shown.length === 0 && <p className="px-5 py-10 text-center text-muted">No decks match "{query}".</p>}
      <ul>
        {shown?.map((d) => (
          <li key={d.id} className="flex items-center border-b border-border pr-2">
            <Link to={`/decks/${d.id}`} className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-4 py-3 pl-5 pr-2 hover:bg-surface">
              <span className="truncate font-serif text-lg">{d.title}</span>
              <span className={`shrink-0 text-sm tabular-nums ${d.due > 0 ? 'font-semibold' : 'text-muted'}`}>
                {d.due}
                <span className="sr-only"> due</span>{/* the screen shows just the number; screen readers also hear what it counts */}
              </span>
            </Link>
            <IconButton label={`Actions for ${d.title}`} onClick={() => setMenuFor(d)}><Ellipsis size={20} aria-hidden /></IconButton>
          </li>
        ))}
      </ul>
      <DeckMenu deck={menuFor} onClose={() => setMenuFor(null)} onDeleted={reload} />
    </>
  );
}
