import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, Button, ButtonLink, ConfirmDialog, EmptyState, ErrorMessage, FormRow, GrowingTextarea, IconButton, Page, rowInput } from '../../components/ui';
import type { Card, DeckSummary } from '../../domain/types';
import { DeckPicker } from '../../components/DeckPicker';
import { InfoLabel } from '../../components/InfoDrawer';
import { toast } from '../../components/shadcn/toast';
import { canSplit, splitPassage, type SplitResult } from '../../domain/bible/split';
import { ValidationError } from '../../domain/errors';
import { loadCardKinds } from '../study/cardKinds';
import { asLang } from '../study/verseLang';
import { useI18n } from '../../i18n/I18nProvider';
import { deleteCardsWithUndo } from './undoDelete';
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
  const [invalid, setInvalid] = useState<'reference' | 'passage'>();
  const [confirming, setConfirming] = useState(false);
  const [split, setSplit] = useState<SplitResult | null>(null);
  const [splitBusy, setSplitBusy] = useState(false);
  const [splitError, setSplitError] = useState<string>();
  const referenceInput = useRef<HTMLInputElement>(null);
  const lang = asLang(deckList.find((d) => d.id === deckId)?.bibleLanguage); // so verses typed here are read in their own language

  /** After adding, the form stays open with the verse and passage cleared (deck and source kept), ready for the next card. */
  const readyForNext = () => {
    setError(undefined);
    setReference('');
    setVerseText('');
    referenceInput.current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (card) {
        await cards.update(card.id, { reference, verseText, note });
        navigate(-1);
        toast.add({ title: t('toast.changesSaved'), type: 'success' });
      } else {
        const saved = await cards.create(deckId, { reference, verseText, note });
        toast.add({ title: t('toast.cardAdded', { reference: saved.reference }), type: 'success' });
        readyForNext();
      }
    } catch (err) {
      setError(describeError(err));
      // Say which field is wrong (and put the cursor in it), not just that something is.
      const field = err instanceof ValidationError ? (err.code === 'reference-required' ? 'reference' : err.code === 'verse-text-required' ? 'passage' : undefined) : undefined;
      setInvalid(field);
      if (field === 'reference') referenceInput.current?.focus();
      if (field === 'passage') document.getElementById('passage')?.focus();
    }
  };

  const confirmSplit = async () => {
    if (!split?.ok) return;
    setSplitBusy(true);
    setSplitError(undefined);
    try {
      await cards.createMany(deckId, split.verses.map((v) => ({ reference: v.reference, verseText: v.text, note })));
      toast.add({ title: t('toast.versesAdded', { count: split.verses.length }), type: 'success' });
      setSplit(null);
      setSplitBusy(false);
      readyForNext();
    } catch (err) {
      setSplitError(describeError(err));
      setSplitBusy(false);
    }
  };

  const remove = async () => {
    try { await deleteCardsWithUndo(cards, [card!.id], t); navigate(-1); }
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
        {error && <ErrorMessage id="form-error" error={error} />}
        <div>
          {!card && (
            <FormRow label={t('cardForm.deck')}>
              {(fid) => (
                <DeckPicker id={fid} variant="field" label={t('cardForm.deck')} value={deckId} options={deckList.map((d) => ({ value: d.id, label: d.title }))} onChange={setDeckId} />
              )}
            </FormRow>
          )}
          <FormRow label={t('cardForm.verses')}>{(fid) => <input id={fid} ref={referenceInput} lang={lang} aria-invalid={invalid === 'reference' || undefined} aria-describedby={invalid === 'reference' ? 'form-error' : undefined} className={rowInput} value={reference} onChange={(e) => { setReference(e.target.value); setInvalid(undefined); }} placeholder={t('cardForm.versesPlaceholder')} autoFocus={!card} />}</FormRow>
          <FormRow
            label={t('cardForm.note')}
            labelNode={<InfoLabel title={t('cardForm.note')} info={t('cardForm.noteInfo')} className="w-24 shrink-0 text-[0.9375rem] font-medium" />}
          >
            {(fid) => <input id={fid} aria-label={t('cardForm.note')} className={rowInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('common.optional')} />}
          </FormRow>
        </div>

        <div className="space-y-2">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="passage" className="text-[0.9375rem] font-medium">{t('cardForm.passage')}</label>
            <BibleGatewayHelper reference={reference} />
          </div>
          <GrowingTextarea
            id="passage"
            lang={lang}
            aria-invalid={invalid === 'passage' || undefined}
            aria-describedby={invalid === 'passage' ? 'form-error' : undefined}
            className="scripture"
            value={verseText}
            onChange={(e) => { setVerseText(e.target.value); setInvalid(undefined); }}
            placeholder={t('cardForm.passagePlaceholder')}
          />
          {/* Only offered when it can actually be used: a chapter or several verses, with a passage to split. */}
          {!card && canSplit(reference) && verseText.trim() && (
            <div className="flex justify-center pt-3">
              <Button variant="secondary" onClick={() => { setSplitError(undefined); setSplit(splitPassage(reference, verseText)); }}>
                {t('cardForm.split')}
              </Button>
            </div>
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
