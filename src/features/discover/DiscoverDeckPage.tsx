import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from '../../components/shadcn/toast';
import { Flag } from 'lucide-react';
import { AppBar, BackButton, Button, EmptyState, ErrorMessage, IconButton, Page } from '../../components/ui';
import { useAsync } from '../../app/useAsync';
import { useRepositories } from '../../app/repositories';
import { loadBackends } from '../sharing/backend';
import { useI18n } from '../../i18n/I18nProvider';
import { PUBLIC_SCHEMA_VERSION } from '../../domain/sharing/version';
import { deckSummary } from './names';
import { ReportDrawer } from './ReportDrawer';

const PREVIEW = 5;

/** One public deck: what it is, a taste of its cards, and Import (a copy that is yours alone) or Report. */
export function DiscoverDeckPage() {
  const { t, describeError } = useI18n();
  const { id = '' } = useParams();
  const { exchange } = useRepositories();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reporting, setReporting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data, loading, error: loadError } = useAsync(async () => {
    const { discover } = await loadBackends();
    const deck = await discover.getDeck(id);
    if (!deck) return { deck: null, cards: [], have: undefined };
    return { deck, cards: await discover.getCards(id), have: await exchange.findImported(id) };
  }, [id, exchange]);

  if (loading) return <><AppBar back={<BackButton to="/discover" label={t('common.back')} />} /><Page><p role="status" className="text-muted">{t('discover.loading')}</p></Page></>;
  if (loadError) return <><AppBar back={<BackButton to="/discover" label={t('common.back')} />} /><Page><ErrorMessage error={t('discover.error')} /></Page></>;
  if (!data?.deck) return <><AppBar back={<BackButton to="/discover" label={t('common.back')} />} /><EmptyState title={t('discover.notFound')}>{null}</EmptyState></>;
  const { deck, cards, have } = data;
  // Published by a newer app, in a format this one might misread: it can be looked at, but not imported until the app is updated.
  const needsUpdate = deck.v > PUBLIC_SCHEMA_VERSION;

  const importDeck = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await exchange.importCards(
        { title: deck.title, description: deck.description, translationCode: deck.translation, bibleLanguage: deck.language, importedFrom: deck.id },
        cards.map((c) => ({ reference: c.reference, verseText: c.verseText })),
      );
      toast.add({ title: t('toast.importedDeck', { title: deck.title }), type: 'success' });
      navigate(`/decks/${result.deckIds[0]}`, { replace: true });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  return (
    <>
      <AppBar back={<BackButton to="/discover" label={t('common.back')} />} />
      <Page className="space-y-6 pt-4">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 font-serif text-2xl font-medium tracking-tight">{deck.title}</h1>
            <IconButton label={t('report.title')} onClick={() => setReporting(true)} className="-mr-3 -mt-1.5 shrink-0 text-muted"><Flag size={20} aria-hidden /></IconButton>
          </div>
          <p className="text-muted">{deckSummary(deck, t('translation.own'), t('import.cards', { count: cards.length }))}</p>
          {deck.description && <p className="whitespace-pre-line pt-2">{deck.description}</p>}
        </div>

        <section aria-label={t('discover.preview')} className="space-y-3 rounded-3xl bg-panel px-5 py-5">
          {(showAll ? cards : cards.slice(0, PREVIEW)).map((c) => (
            <div key={c.id}>
              <p lang={deck.language} className="font-serif font-medium">{c.reference}</p>
              <p lang={deck.language} className={`scripture text-[0.9375rem] leading-normal text-muted ${showAll ? '' : 'line-clamp-2'}`}>{c.verseText}</p>
            </div>
          ))}
          {cards.length > PREVIEW && (
            <Button variant="ghost" className="w-full" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? t('discover.showLess') : t('discover.showMore', { count: cards.length - PREVIEW })}
            </Button>
          )}
        </section>

        {have && (
          <p role="status" className="text-[0.9375rem]">
            {t('discover.alreadyHave')} <Link to={`/decks/${have.id}`} className="font-medium underline underline-offset-4">{t('discover.open')}</Link>
          </p>
        )}
        {error && <ErrorMessage error={error} />}
        {needsUpdate && <p role="status" className="rounded-lg border border-border bg-surface p-3.5 text-[0.9375rem]">{t('discover.needsUpdate')}</p>}
        <div className="space-y-2">
          <Button className="w-full" disabled={busy || cards.length === 0 || needsUpdate} onClick={() => void importDeck()}>{have ? t('discover.importAgain') : t('discover.import')}</Button>
        </div>
      </Page>
      <ReportDrawer deckId={deck.id} open={reporting} onClose={() => setReporting(false)} />
    </>
  );
}
