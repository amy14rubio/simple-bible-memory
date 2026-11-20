import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EllipsisVertical, Keyboard, Layers, Mic, TextCursorInput, type LucideIcon } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { useRefreshOnWrites } from '../../app/useRefreshOnWrites';
import { AppBar, BackButton, ButtonLink, EmptyState, ErrorMessage, IconButton, Page } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { loadCardKinds } from '../study/cardKinds';
import { loadNewPerDay } from '../study/newPerDay';
import { DeckMenu } from './DeckMenu';
import { DoneForToday } from '../study/DoneForToday';

const MODES: { mode: string; title: MessageKey; hint: MessageKey; Icon: LucideIcon }[] = [
  { mode: 'flashcard', title: 'mode.flashcard', hint: 'mode.flashcardHint', Icon: Layers },
  { mode: 'type', title: 'mode.type', hint: 'mode.typeHint', Icon: Keyboard },
  { mode: 'blanks', title: 'mode.blanks', hint: 'mode.blanksHint', Icon: TextCursorInput },
];

const tile = 'flex w-full flex-col justify-between gap-3 rounded-lg border p-4 @min-[19rem]:aspect-[5/4]'; // (the 5:4 shape only when two sit side by side)

/** "Open deck view": how do you want to study? plus the deck's card counts. */
export function DeckHomePage() {
  const { t } = useI18n();
  const { id = '' } = useParams();
  const { decks, reviews, settings } = useRepositories();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const extraPractice = useSearchParams()[0].get('practice') === '1';
  const { data, loading, refresh } = useAsync(async () => {
    const newPerDay = await loadNewPerDay(settings);
    const kinds = await loadCardKinds(settings);
    return {
      deck: await decks.get(id),
      stats: await reviews.stats(id, kinds),
      queued: (await reviews.buildQueue(id, { newPerDay, kinds })).length,
      nextDue: await reviews.nextDue(id, kinds),
    };
  }, [id, decks, reviews, settings]);
  useRefreshOnWrites(refresh);

  // While the collection loads: just the top bar with its back arrow (no placeholder shapes), so it is never blank.
  if (loading) return <AppBar back={<BackButton to="/" label={t('common.backToDecks')} />} />;
  if (!data?.deck) return <><AppBar back={<BackButton to="/" label={t('common.backToDecks')} />} /><Page><ErrorMessage error={t('error.deckGone')} /></Page></>;
  const { deck, stats, queued, nextDue } = data;

  return (
    <>
      <AppBar
        title={deck.title}
        back={<BackButton to="/" label={t('common.backToDecks')} />}
        actions={<IconButton label={t('deckHome.actions')} onClick={() => setMenuOpen(true)}><EllipsisVertical size={20} aria-hidden /></IconButton>}
      />
      {stats.total === 0 ? (
        <EmptyState title={t('deckHome.emptyTitle')} action={<ButtonLink to={`/cards/new?collection=${id}`}>{t('common.newCard')}</ButtonLink>}>
          {t('deckHome.emptyBody')}
        </EmptyState>
      ) : (
        <Page className="space-y-8">
          {extraPractice ? (
            <>
              <section aria-labelledby="how" className="space-y-3 text-center">
                <h2 id="how" className="font-serif text-xl">{t('deckHome.extraTitle')}</h2>
                <p role="status" className="mx-auto max-w-xs text-sm text-muted">
                  {t('deckHome.extraBody')}
                </p>
              </section>
              <StudyTiles id={id} practice />
              <div className="text-center">
                <Link to={`/collections/${id}`} className="inline-flex min-h-11 items-center px-3 text-sm text-muted underline underline-offset-4 hover:text-foreground">{t('deckHome.backToRegular')}</Link>
              </div>
            </>
          ) : queued > 0 ? (
            <>
              <section aria-labelledby="how" className="space-y-3 text-center">
                <h2 id="how" className="font-serif text-xl">{t('deckHome.how')}</h2>
                <p role="status" className="text-sm text-muted">{t('deckHome.toStudy', { count: queued })}</p>
              </section>
              <StudyTiles id={id} />
            </>
          ) : (
            <div className="py-6">
              <DoneForToday deckId={id} nextDue={nextDue} as="h2" showBack={false} />
              {nextDue === null && stats.new === 0 && <p className="mx-auto mt-4 max-w-xs text-center text-muted">{t('deckHome.comeBack')}</p>}
            </div>
          )}
        </Page>
      )}
      <DeckMenu deck={menuOpen ? { id, title: deck.title } : null} onClose={() => setMenuOpen(false)} onDeleted={() => navigate('/', { replace: true })} />
    </>
  );
}

function StudyTiles({ id, practice = false }: { id: string; practice?: boolean }) {
  const { t } = useI18n();
  return (
    // two tiles across while there is room for both (measured in rem, so big text gets one column instead of words spilling out of their tile)
    <div className="@container">
    <ul className="mx-auto grid max-w-md grid-cols-1 gap-3 @min-[19rem]:grid-cols-2">
      {MODES.map(({ mode, title, hint, Icon }) => (
        <li key={mode} className="flex">
          <Link to={`/collections/${id}/study/${mode}${practice ? '?practice=1' : ''}`} className={`${tile} border-border bg-background hover:bg-surface`}>
            <Icon size={22} aria-hidden className="text-muted" />
            <span>
              <span className="block break-words font-serif text-lg">{t(title)}</span>
              <span className="text-[0.8125rem] text-muted">{t(hint)}</span>
            </span>
          </Link>
        </li>
      ))}
      <li className="flex">
        <Link to={`/collections/${id}/study/speak${practice ? '?practice=1' : ''}`} className={`${tile} border-border bg-background hover:bg-surface`}>
          <Mic size={22} aria-hidden className="text-muted" />
          <span><span className="block break-words font-serif text-lg">{t('mode.speak')}</span><span className="text-[0.8125rem] text-muted">{t('mode.speakHint')}</span></span>
        </Link>
      </li>
    </ul>
    </div>
  );
}
