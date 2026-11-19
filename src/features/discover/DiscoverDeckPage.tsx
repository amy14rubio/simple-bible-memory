import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from '../../components/shadcn/toast';
import { Flag, Share2 } from 'lucide-react';
import { AppBar, BackButton, Button, EmptyState, ErrorMessage, IconButton, Page } from '../../components/ui';
import { useAsync } from '../../app/useAsync';
import { useRepositories } from '../../app/repositories';
import { loadBackends } from '../sharing/backend';
import { useI18n } from '../../i18n/I18nProvider';
import { PUBLIC_SCHEMA_VERSION } from '../../domain/sharing/version';
import { deckSummary, useLanguageNames } from './names';
import { isLicensed } from '../../domain/bible/sources';
import { MIXED } from '../../domain/sharing/plan';
import { Attribution } from '../bible/Attribution';
import { ReportDrawer } from './ReportDrawer';
import { shareLink } from '../../lib/shareLink';
import { deckShareUrl } from '../../lib/site';

const PREVIEW = 3;
/** About two lines of a phone's width: a longer verse is cut short with "…" until "show more" is pressed. */
const CLAMPED_AFTER = 100;

/** One public deck: what it is, a taste of its cards, and Import (a copy that is yours alone) or Report. */
export function DiscoverDeckPage() {
  const { t, describeError } = useI18n();
  useLanguageNames();
  const { id = '' } = useParams();
  const { exchange } = useRepositories();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reporting, setReporting] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data, loading, error: loadError, reload } = useAsync(async () => {
    const { discover } = await loadBackends();
    const deck = await discover.getDeck(id);
    if (!deck) return { deck: null, cards: [], have: undefined };
    return { deck, cards: await discover.getCards(id), have: await exchange.findImported(id) };
  }, [id, exchange]);

  // When the internet comes back, a collection that failed to load loads again by itself (the button does the same).
  useEffect(() => {
    if (!loadError) return;
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [loadError, reload]);

  if (loading) return <><AppBar back={<BackButton to="/discover" label={t('common.back')} />} /><Page><p role="status" className="text-muted">{t('discover.loading')}</p></Page></>;
  if (loadError) return <><AppBar back={<BackButton to="/discover" label={t('common.back')} />} /><EmptyState title={t('discover.error')} action={<Button variant="secondary" onClick={reload}>{t('discover.retry')}</Button>}>{t('discover.errorBody')}</EmptyState></>;
  if (!data?.deck) return <><AppBar back={<BackButton to="/discover" label={t('common.back')} />} /><EmptyState title={t('discover.notFound')}>{null}</EmptyState></>;
  const { deck, cards, have } = data;
  // Published by a newer app, in a format this one might misread: it can be looked at, but not imported until the app is updated.
  const needsUpdate = deck.v > PUBLIC_SCHEMA_VERSION;

  const importDeck = async () => {
    setBusy(true);
    setError(undefined);
    try {
      // A licensed text is not in the public deck: its cards come with the reference and the translation, and the text is fetched
      // to this device from the publisher afterwards. (Such a deck's own label, a licensed code or "mixed", is not kept: the cards say it.)
      const ownLabel = isLicensed(deck.translation) || deck.translation === MIXED ? null : deck.translation;
      const result = await exchange.importCards(
        { title: deck.title, description: deck.description, translationCode: ownLabel, bibleLanguage: deck.language, importedFrom: deck.id },
        cards.map((c) => ({ reference: c.reference, verseText: isLicensed(c.translation) ? '' : c.verseText, ...(c.translation ? { translationCode: c.translation } : {}) })),
      );
      toast.add({ title: t('toast.importedDeck', { title: deck.title }), type: 'success' });
      navigate(`/collections/${result.deckIds[0]}`, { replace: true });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      const result = await shareLink({ title: deck.title, text: t('discover.shareText', { title: deck.title }), url: deckShareUrl(deck.id) });
      if (result === 'copied') toast.add({ title: t('toast.linkCopied'), type: 'success' });
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <>
      <AppBar back={<BackButton to="/discover" label={t('common.back')} />} />
      <Page className="space-y-6 pt-4">
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 font-serif text-2xl font-medium tracking-tight">{deck.title}</h1>
            <div className="-mr-3 -mt-1.5 flex shrink-0">
              <IconButton label={t('discover.share')} onClick={() => void share()} className="text-muted"><Share2 size={20} aria-hidden /></IconButton>
              <IconButton label={t('report.title')} onClick={() => setReporting(true)} className="text-muted"><Flag size={20} aria-hidden /></IconButton>
            </div>
          </div>
          <p className="text-muted">{deckSummary(deck, t('translation.own'), t('import.cards', { count: cards.length }), t('translation.mixed'))}</p>
          {deck.description && <p className="whitespace-pre-line pt-2">{deck.description}</p>}
        </div>

        <section aria-label={t('discover.preview')} className="space-y-3 rounded-3xl bg-panel px-5 py-5">
          {(showAll ? cards : cards.slice(0, PREVIEW)).map((c) => (
            <div key={c.id}>
              <p lang={deck.language} className="font-serif font-medium">{c.reference}</p>
              {isLicensed(c.translation)
                ? <><p className="text-[0.9375rem] leading-normal text-muted">{t('discover.textAfterImport')}</p><Attribution code={c.translation} compact /></>
                : <p lang={deck.language} className={`scripture text-[0.9375rem] leading-normal text-muted ${showAll ? '' : 'line-clamp-2'}`}>{c.verseText}</p>}
            </div>
          ))}
          {/* More cards than the preview, or a verse the preview cuts short with "…": either way there is more to show. */}
          {(cards.length > PREVIEW || cards.slice(0, PREVIEW).some((c) => !isLicensed(c.translation) && c.verseText.length > CLAMPED_AFTER)) && (
            <Button variant="ghost" className="w-full" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {showAll ? t('discover.showLess') : cards.length > PREVIEW ? t('discover.showMore', { count: cards.length - PREVIEW }) : t('discover.showFull')}
            </Button>
          )}
        </section>

        {have && (
          <p role="status" className="text-[0.9375rem]">
            {t('discover.alreadyHave')} <Link to={`/collections/${have.id}`} className="font-medium underline underline-offset-4">{t('discover.open')}</Link>
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
