import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Search, X } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, ButtonLink, EmptyState, ErrorMessage, IconButton, IconLink, Page, TitleSelect } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/** "Card browse": a two-column table of verse references and passages. */
export function CardBrowsePage() {
  const { t } = useI18n();
  const { id = '' } = useParams();
  const { decks, cards } = useRepositories();
  const navigate = useNavigate();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const { data, loading } = useAsync(async () => ({ all: await decks.list(), list: await cards.listByDeck(id) }), [id, decks, cards]);

  if (loading) return null;
  const deck = data?.all.find((d) => d.id === id);
  if (!data || !deck) return <><AppBar back={<BackButton to="/" label={t('common.backToDecks')} />} /><Page><ErrorMessage error={t('error.deckGone')} /></Page></>;

  const q = query.trim().toLowerCase();
  const shown = data.list.filter((c) => c.reference.toLowerCase().includes(q) || c.verseText.toLowerCase().includes(q));

  return (
    <>
      <AppBar
        back={<BackButton to="/" label={t('common.backToDecks')} />}
        titleSlot={
          <>
            <h1 className="sr-only">{t('browse.heading', { deck: deck.title })}</h1>
            <TitleSelect label={t('browse.deck')} value={id} options={data.all.map((d) => ({ value: d.id, label: d.title }))} onChange={(v) => navigate(`/decks/${v}/cards`)} />
          </>
        }
        actions={
          <>
            <IconLink to={`/cards/new?deck=${id}`} label={t('common.newCard')}><Plus size={22} aria-hidden /></IconLink>
            <IconButton label={searching ? t('browse.searchClose') : t('browse.search')} aria-pressed={searching} onClick={() => { setSearching((s) => !s); setQuery(''); }}>
              {searching ? <X size={20} aria-hidden /> : <Search size={20} aria-hidden />}
            </IconButton>
          </>
        }
      />
      {searching && (
        <div className="border-b border-border px-5 py-2">
          <input aria-label={t('browse.search')} type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('browse.searchPlaceholder')} className="w-full bg-transparent py-2 text-base placeholder:text-muted" />
        </div>
      )}
      {data.list.length === 0 ? (
        <EmptyState title={t('browse.emptyTitle')} action={<ButtonLink to={`/cards/new?deck=${id}`}>{t('common.newCard')}</ButtonLink>}>
          {t('browse.emptyBody')}
        </EmptyState>
      ) : (
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">{t('browse.heading', { deck: deck.title })}</caption>
          <thead>
            <tr className="border-b border-border text-sm text-muted">
              <th scope="col" className="w-2/5 px-5 py-3 font-medium">{t('browse.verse')}</th>
              <th scope="col" className="py-3 pr-5 font-medium">{t('browse.passage')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c) => (
              // The whole row opens the card, and nothing outside the row does. The link inside is for keyboards and screen readers.
              <tr
                key={c.id}
                onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) navigate(`/cards/${c.id}/edit`); }}
                className="cursor-pointer border-b border-border hover:bg-surface"
              >
                <td className="px-5 py-3.5 align-top font-serif font-medium">
                  <Link to={`/cards/${c.id}/edit`} className="block focus-visible:outline-offset-4">{c.reference}</Link>
                </td>
                <td className="py-3.5 pr-5 align-top"><span className="scripture line-clamp-2 text-[0.9375rem] leading-normal text-muted">{c.verseText}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.list.length > 0 && shown.length === 0 && <p className="px-5 py-10 text-center text-muted">{t('browse.noMatch', { query })}</p>}
    </>
  );
}
