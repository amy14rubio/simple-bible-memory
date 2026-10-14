import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ellipsis, Keyboard, Layers, Mic, TextCursorInput, type LucideIcon } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, ButtonLink, EmptyState, ErrorMessage, IconButton, Page } from '../../components/ui';
import { formatInterval } from '../../domain/scheduling/format';
import { loadCardKinds } from '../study/cardKinds';
import { loadNewPerDay } from '../study/newPerDay';
import { DeckMenu } from './DeckMenu';

const MODES: { mode: string; title: string; hint: string; Icon: LucideIcon }[] = [
  { mode: 'flashcard', title: 'Flashcard', hint: 'Flip it both ways', Icon: Layers },
  { mode: 'type', title: 'Type', hint: 'Type your answer', Icon: Keyboard },
  { mode: 'blanks', title: 'Blanks', hint: 'Fill in or choose', Icon: TextCursorInput },
];

const tile = 'flex aspect-[5/4] flex-col justify-between rounded-lg border p-4';

/** "Open deck view": how do you want to study? plus the deck's card counts. */
export function DeckHomePage() {
  const { id = '' } = useParams();
  const { decks, reviews, settings } = useRepositories();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const extraPractice = useSearchParams()[0].get('practice') === '1';
  const { data, loading } = useAsync(async () => {
    const newPerDay = await loadNewPerDay(settings);
    const kinds = await loadCardKinds(settings);
    return {
      deck: await decks.get(id),
      stats: await reviews.stats(id, kinds),
      queued: (await reviews.buildQueue(id, { newPerDay, kinds })).length,
      nextDue: await reviews.nextDue(id, kinds),
    };
  }, [id, decks, reviews, settings]);

  if (loading) return null;
  if (!data?.deck) return <><AppBar back={<BackButton to="/" label="Back to decks" />} /><Page><ErrorMessage error="This deck no longer exists." /></Page></>;
  const { deck, stats, queued, nextDue } = data;

  return (
    <>
      <AppBar
        title={deck.title}
        back={<BackButton to="/" label="Back to decks" />}
        actions={<IconButton label="Deck actions" onClick={() => setMenuOpen(true)}><Ellipsis size={20} aria-hidden /></IconButton>}
      />
      {stats.total === 0 ? (
        <EmptyState title="Nothing to study yet" action={<ButtonLink to={`/cards/new?deck=${id}`}>New card</ButtonLink>}>
          Add at least one card to this deck.
        </EmptyState>
      ) : (
        <Page className="space-y-8">
          {extraPractice ? (
            <>
              <section aria-labelledby="how" className="space-y-3 text-center">
                <h2 id="how" className="font-serif text-xl">Extra practice</h2>
                <p role="status" className="mx-auto max-w-xs text-sm text-muted">
                  Go through every card in this deck. Nothing you do here counts toward your schedule or statistics.
                </p>
              </section>
              <StudyTiles id={id} practice />
              <div className="text-center">
                <Link to={`/decks/${id}`} className="inline-flex min-h-11 items-center px-3 text-sm text-muted underline underline-offset-4 hover:text-foreground">Back to regular study</Link>
              </div>
            </>
          ) : queued > 0 ? (
            <>
              <section aria-labelledby="how" className="space-y-3 text-center">
                <h2 id="how" className="font-serif text-xl">How do you want to study?</h2>
                <p role="status" className="text-sm text-muted">{queued} {queued === 1 ? 'card' : 'cards'} to study today.</p>
              </section>
              <StudyTiles id={id} />
            </>
          ) : (
            <section aria-labelledby="caught-up" className="space-y-2 py-6 text-center">
              <h2 id="caught-up" className="font-serif text-xl">You're all caught up</h2>
              <p role="status" className="mx-auto max-w-xs text-muted">
                {nextDue !== null
                  ? `Your next review is in ${formatInterval(nextDue - Date.now())}.`
                  : stats.new > 0
                    ? "You've reached today's limit for new cards. You can raise it in Settings."
                    : 'Come back after you add more verses.'}
              </p>
            </section>
          )}
        </Page>
      )}
      <DeckMenu deck={menuOpen ? { id, title: deck.title } : null} onClose={() => setMenuOpen(false)} onDeleted={() => navigate('/', { replace: true })} />
    </>
  );
}

function StudyTiles({ id, practice = false }: { id: string; practice?: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {MODES.map(({ mode, title, hint, Icon }) => (
        <li key={mode}>
          <Link to={`/decks/${id}/study/${mode}${practice ? '?practice=1' : ''}`} className={`${tile} border-border bg-background hover:bg-surface`}>
            <Icon size={22} aria-hidden className="text-muted" />
            <span>
              <span className="block font-serif text-lg">{title}</span>
              <span className="text-sm text-muted">{hint}</span>
            </span>
          </Link>
        </li>
      ))}
      <li>
        <div className={`${tile} border-dashed border-border text-muted`}>
          <Mic size={22} aria-hidden />
          <span><span className="block font-serif text-lg">Speak</span><span className="text-sm">Coming later</span></span>
        </div>
      </li>
    </ul>
  );
}
