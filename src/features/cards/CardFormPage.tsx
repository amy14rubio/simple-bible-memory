import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, Button, ButtonLink, ConfirmDialog, EmptyState, ErrorMessage, FormRow, IconButton, Page, rowInput } from '../../components/ui';
import type { Card, DeckSummary } from '../../domain/types';
import { canSplit, splitPassage, type SplitResult } from '../../domain/bible/split';
import { loadCardKinds } from '../study/cardKinds';
import { useI18n } from '../../i18n/I18nProvider';
import { BibleGatewayHelper } from './BibleGatewayHelper';
import { SplitDialog } from './SplitDialog';

/** "Add card" (/cards/new?deck=ID) and "Edit card" (/cards/:id/edit). */
export function CardFormPage() {
  const { t } = useI18n();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { decks, cards, settings } = useRepositories();
  const { data, loading } = useAsync(
    async () => ({ decks: await decks.list(), card: id ? await cards.get(id) : undefined, studyCardsPerVerse: (await loadCardKinds(settings)).length }),
    [id, decks, cards, settings],
  );
  if (loading || !data) return null;
  const back = <BackButton label={t('common.back')} />;
  if (id && !data.card) return <><AppBar back={back} /><Page><ErrorMessage error={t('error.cardGone')} /></Page></>;
  if (!id && data.decks.length === 0) {
    return (
      <>
        <AppBar title={t('cardForm.add')} back={back} />
        <EmptyState title={t('cardForm.createDeckFirst')} action={<ButtonLink to="/decks/new">{t('common.newDeck')}</ButtonLink>}>{t('cardForm.cardsLiveInDecks')}</EmptyState>
      </>
    );
  }
  return <CardForm card={data.card} decks={data.decks} initialDeckId={params.get('deck') ?? data.decks[0]!.id} studyCardsPerVerse={data.studyCardsPerVerse} />;
}

function CardForm({ card, decks: deckList, initialDeckId, studyCardsPerVerse }: { card?: Card; decks: DeckSummary[]; initialDeckId: string; studyCardsPerVerse: number }) {
  const { t, describeError } = useI18n();
  const { cards } = useRepositories();
  const navigate = useNavigate();
  const [deckId, setDeckId] = useState(deckList.some((d) => d.id === initialDeckId) ? initialDeckId : deckList[0]!.id);
  const [reference, setReference] = useState(card?.reference ?? '');
  const [verseText, setVerseText] = useState(card?.verseText ?? '');
  const [note, setNote] = useState(card?.note ?? '');
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<string>();
  const [split, setSplit] = useState<SplitResult | null>(null);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitError, setSplitError] = useState<string>();
  const referenceInput = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (card) await cards.update(card.id, { reference, verseText, note });
      else await cards.create(deckId, { reference, verseText, note });
      if (card) navigate(-1);
      else navigate(`/decks/${deckId}/cards`, { replace: true });
    } catch (err) { setError(describeError(err)); }
  };

  /** Saves this card, then clears the verse and passage so the next one can be typed straight away. */
  const addAnother = async () => {
    try {
      const saved = await cards.create(deckId, { reference, verseText, note });
      setError(undefined);
      setStatus(t('cardForm.saved', { reference: saved.reference }));
      setReference('');
      setVerseText('');
      referenceInput.current?.focus();
    } catch (err) { setStatus(undefined); setError(describeError(err)); }
  };

  const confirmSplit = async () => {
    if (!split?.ok) return;
    setSplitBusy(true);
    setSplitError(undefined);
    try {
      await cards.createMany(deckId, split.verses.map((v) => ({ reference: v.reference, verseText: v.text, note })));
      navigate(`/decks/${deckId}/cards`, { replace: true });
    } catch (err) {
      setSplitError(describeError(err));
      setSplitBusy(false);
    }
  };

  const remove = async () => {
    try { await cards.delete(card!.id); navigate(-1); }
    catch (err) { setConfirming(false); setError(describeError(err)); }
  };

  return (
    <form id="card-form" onSubmit={submit}>
      <AppBar
        title={card ? t('cardForm.edit') : t('cardForm.add')}
        back={<BackButton label={t('common.cancel')} />}
        actions={<IconButton type="submit" label={t('common.save')}><Check size={22} aria-hidden /></IconButton>}
      />
      <Page className="space-y-5 pt-2">
        {error && <ErrorMessage error={error} />}
        {status && <p role="status" className="text-sm font-medium">{status}</p>}
        <div>
          {!card && (
            <FormRow label={t('cardForm.deck')}>
              {(fid) => (
                <select id={fid} className={`${rowInput} font-medium`} value={deckId} onChange={(e) => setDeckId(e.target.value)}>
                  {deckList.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              )}
            </FormRow>
          )}
          <FormRow label={t('cardForm.verses')}>{(fid) => <input id={fid} ref={referenceInput} className={rowInput} value={reference} onChange={(e) => { setReference(e.target.value); setStatus(undefined); }} placeholder={t('cardForm.versesPlaceholder')} autoFocus={!card} />}</FormRow>
          <FormRow label={t('cardForm.source')}>{(fid) => <input id={fid} className={rowInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('cardForm.sourcePlaceholder')} />}</FormRow>
        </div>

        <div className="space-y-2">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="passage" className="text-[0.9375rem] font-medium">{t('cardForm.passage')}</label>
            <BibleGatewayHelper reference={reference} />
          </div>
          <textarea
            id="passage"
            className="scripture min-h-56 w-full rounded-lg border border-border bg-surface px-4 py-3.5 text-lg placeholder:text-muted"
            value={verseText}
            onChange={(e) => setVerseText(e.target.value)}
            placeholder={t('cardForm.passagePlaceholder')}
          />
          {!card && (
            <>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button variant="secondary" onClick={addAnother}>{t('cardForm.addAnother')}</Button>
                <Button variant="secondary" onClick={() => { setSplitError(undefined); setSplit(splitPassage(reference, verseText)); }} disabled={!canSplit(reference) || !verseText.trim()}>
                  {t('cardForm.split')}
                </Button>
              </div>
              <p className="text-sm text-muted">{t('cardForm.splitHint')}</p>
            </>
          )}
        </div>

        {card && (
          <div className="border-t border-border pt-5">
            <Button variant="danger" onClick={() => setConfirming(true)}>{t('cardForm.delete')}</Button>
          </div>
        )}
      </Page>
      <SplitDialog result={split} studyCardsPerVerse={studyCardsPerVerse} busy={splitBusy} error={splitError} onCancel={() => setSplit(null)} onConfirm={confirmSplit} />
      <ConfirmDialog
        open={confirming}
        title={t('cardForm.deleteTitle')}
        message={t('cardForm.deleteBody', { reference: card?.reference ?? t('cardForm.thisCard') })}
        confirmLabel={t('cardForm.delete')}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />
    </form>
  );
}
