import { ButtonLink } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * "You're done for today!": what a deck says when nothing is left for today. It always says when the next review is (so nobody has
 * to wonder), and "Keep practicing" opens Extra practice for anyone who is still getting the hang of their verses and wants more.
 */
export function DoneForToday({ deckId, nextDue, reviewed, as: Heading = 'h1', showBack = true }: {
  deckId: string; nextDue: number | null; /** Cards just reviewed (after a session). */ reviewed?: number; as?: 'h1' | 'h2'; /** Not on the deck's own page, which is where "Back to deck" goes. */ showBack?: boolean;
}) {
  const { t, formatInterval } = useI18n();
  return (
    <div className="space-y-8 text-center">
      <div className="space-y-2">
        <Heading className="font-serif text-3xl font-medium tracking-tight">{t('study.doneToday')}</Heading>
        {reviewed !== undefined && <p className="text-muted">{t('study.summary', { count: reviewed })}</p>}
        {nextDue !== null && <p role="status" className="text-muted">{t('deckHome.nextReview', { interval: formatInterval(nextDue - Date.now()) })}</p>}
      </div>
      <div className="mx-auto flex max-w-xs flex-col gap-3">
        <ButtonLink to={`/decks/${deckId}?practice=1`} variant="secondary">{t('study.keepPracticing')}</ButtonLink>
        {showBack && <ButtonLink to={`/decks/${deckId}`}>{t('common.backToDeck')}</ButtonLink>}
      </div>
    </div>
  );
}
