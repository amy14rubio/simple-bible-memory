import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, CircleHelp } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, Button, ButtonLink, ConfirmDialog, EmptyState, ErrorMessage, FormRow, GrowingTextarea, IconButton, Page, Switch, rowInput } from '../../components/ui';
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
import { FindPassageHelper } from './FindPassageHelper';
import { AddCoach, useAddCoach } from '../../components/Coach';
import { autofillSources, sourceFor } from '../../domain/bible/sources';
import { getPassageSource } from '../../platform/youversion';
import { Attribution } from '../bible/Attribution';
import { TranslationPicker } from '../bible/TranslationPicker';
import { useAutofill } from './useAutofill';
import { isSwitchedOff } from '../../domain/bible/switch';
import { useLicensedSwitch } from '../bible/remoteSwitch';
import { SplitDialog } from './SplitDialog';

/** "Add card" (/cards/new?collection=ID; the older ?deck=ID still works) and "Edit card" (/cards/:id/edit). */
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
        <EmptyState title={t('cardForm.createDeckFirst')} action={<ButtonLink to="/collections/new">{t('common.newDeck')}</ButtonLink>}>{t('cardForm.cardsLiveInDecks')}</EmptyState>
      </>
    );
  }
  return <CardForm card={data.card} decks={data.decks} initialDeckId={params.get('collection') ?? params.get('deck') ?? data.decks[0]!.id} studyCardsPerVerse={data.studyCardsPerVerse} />;
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
  const coach = useAddCoach(!card);
  const lang = asLang(deckList.find((d) => d.id === deckId)?.bibleLanguage); // so verses typed here are read in their own language

  // Autofill: the passage fills in from a translation the app can look up. Off unless the person turns it on (or the card already uses one).
  const { language: appLanguage } = useI18n();
  const pickerLanguage = lang === 'es' || (!lang && appLanguage === 'es') ? 'es' : 'en';
  const canAutofill = getPassageSource().available();
  const [autofill, setAutofill] = useState(!!sourceFor(card?.translationCode));
  const [sourceCode, setSourceCode] = useState(() => sourceFor(card?.translationCode)?.code ?? lastSource(pickerLanguage));
  const source = autofill ? sourceFor(sourceCode) : undefined;
  const licensed = source?.kind === 'licensed';
  const switchState = useLicensedSwitch();
  const off = isSwitchedOff(source?.code, switchState); // turned off from the cloud: nothing is looked up
  const fill = useAutofill({ source: off ? undefined : source, reference, skipFor: card && verseText ? `${card.translationCode}|${card.reference}` : undefined, onText: setVerseText });

  /** After adding, the form stays open with the verse and passage cleared (deck and source kept), ready for the next card. */
  const readyForNext = () => {
    setError(undefined);
    setReference('');
    setVerseText('');
    referenceInput.current?.focus();
  };

  // The card's own translation: the one autofill uses; an ordinary card keeps the deck's (and one that used autofill goes back to it).
  const translationCode = autofill && source ? source.code : card && sourceFor(card.translationCode) ? null : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (card) {
        await cards.update(card.id, { reference, verseText, note, translationCode });
        navigate(-1);
        toast.add({ title: t('toast.changesSaved'), type: 'success' });
      } else {
        const saved = await cards.create(deckId, { reference, verseText, note, translationCode });
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
        titleId="form-heading"
        title={card ? t('cardForm.edit') : t('cardForm.add')}
        back={<BackButton label={t('common.cancel')} />}
        actions={<>{!card && <IconButton label={t('coach.add.replay')} onClick={coach.start}><CircleHelp size={22} aria-hidden /></IconButton>}<IconButton type="submit" data-coach="save" label={t('common.save')}><Check size={22} aria-hidden /></IconButton></>}
      />
      <Page className="space-y-5 pt-2">
        {error && <ErrorMessage id="form-error" error={error} />}
        <div>
          {!card && (
            <FormRow label={t('cardForm.deck')} coach="deck">
              {(fid) => (
                <DeckPicker id={fid} variant="field" label={t('cardForm.deck')} value={deckId} options={deckList.map((d) => ({ value: d.id, label: d.title }))} onChange={setDeckId} />
              )}
            </FormRow>
          )}
          <FormRow label={t('cardForm.verses')} coach="verse">{(fid) => <input id={fid} ref={referenceInput} lang={lang} aria-invalid={invalid === 'reference' || undefined} aria-describedby={invalid === 'reference' ? 'form-heading form-error' : 'form-heading'} className={rowInput} value={reference} onChange={(e) => { setReference(e.target.value); if (licensed) setVerseText(''); setInvalid(undefined); setError(undefined); }} placeholder={t('cardForm.versesPlaceholder')} autoFocus={!card} />}</FormRow>
          <FormRow
            label={t('cardForm.note')}
            labelNode={<InfoLabel title={t('cardForm.note')} info={t('cardForm.noteInfo')} className="w-24 shrink-0 text-[0.9375rem] font-medium" />}
          >
            {(fid) => <input id={fid} aria-label={t('cardForm.note')} className={rowInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('common.optional')} />}
          </FormRow>
          {canAutofill && (
            <>
              <FormRow
                coach="autofill"
                label={t('autofill.label')}
                labelNode={<span id="autofill-label" className="w-24 shrink-0"><InfoLabel title={t('autofill.label')} info={t('autofill.info')} className="text-[0.9375rem] font-medium" /></span>}
              >
                {() => (
                  <div className="flex justify-end">
                    <Switch
                      checked={autofill}
                      labelledBy="autofill-label"
                      onChange={(on) => {
                        setAutofill(on);
                        if (!on && licensed) setVerseText(''); // licensed text is not kept once the card stops being one
                      }}
                    />
                  </div>
                )}
              </FormRow>
              {autofill && (
                <FormRow label={t('autofill.translation')} coach="translation">
                  {(fid) => (
                    <TranslationPicker
                      id={fid}
                      value={sourceCode}
                      initialLanguage={pickerLanguage}
                      onChange={(code) => {
                        if (code !== sourceCode) setVerseText(''); // the old text is of another translation
                        setSourceCode(code);
                        rememberSource(code);
                      }}
                    />
                  )}
                </FormRow>
              )}
            </>
          )}
        </div>

        <div data-coach="passage" className="space-y-2">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor="passage" className="text-[0.9375rem] font-medium">{t('cardForm.passage')}</label>
            <FindPassageHelper reference={reference} language={lang} />
          </div>
          <GrowingTextarea
            id="passage"
            lang={lang}
            aria-invalid={invalid === 'passage' || undefined}
            aria-describedby={invalid === 'passage' ? 'form-error' : undefined}
            className="scripture"
            value={verseText}
            readOnly={licensed}
            onChange={(e) => { setVerseText(e.target.value); setInvalid(undefined); setError(undefined); }}
            placeholder={autofill ? t('autofill.waiting') : t('cardForm.passagePlaceholder')}
          />
          {autofill && <AutofillStatus state={fill} translation={source?.name ?? ''} licensed={licensed} hasText={!!verseText} off={off} />}
          {licensed && <Attribution code={source?.code} className="pt-1" />}
          {/* Only offered when it can actually be used: a chapter or several verses, with a passage to split. */}
          {!card && !autofill && canSplit(reference) && verseText.trim() && (
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
      {coach.open && <AddCoach onClose={coach.close} autofill={autofill && canAutofill} />}
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

const SOURCE_KEY = 'sbm-autofill-source';
/** The translation used last time, so the next card starts with it (a per-device convenience: nothing breaks without it). */
function lastSource(language: string): string {
  try {
    const saved = localStorage.getItem(SOURCE_KEY);
    if (saved && sourceFor(saved)) return saved;
  } catch { /* not remembered */ }
  return autofillSources(language)[0]?.code ?? autofillSources()[0]!.code;
}
function rememberSource(code: string) {
  try { localStorage.setItem(SOURCE_KEY, code); } catch { /* not remembered */ }
}

/** What autofill is doing, in words, under the passage. */
function AutofillStatus({ state, translation, licensed, hasText, off }: { state: ReturnType<typeof useAutofill>; translation: string; licensed: boolean; hasText: boolean; off: boolean }) {
  const { t } = useI18n();
  let text: string | null = null;
  if (off) text = t('autofill.switchedOff', { translation });
  else if (state.kind === 'loading') text = t('autofill.loading');
  else if (state.kind === 'offline') text = hasText ? null : t(licensed ? 'autofill.offline' : 'autofill.offlineOpen');
  else if (state.kind === 'problem') text = t(state.problem === 'not-found' ? 'autofill.notFound' : state.problem === 'not-allowed' ? 'autofill.notAllowed' : state.problem === 'busy' ? 'autofill.busy' : 'autofill.failed', { translation });
  else if (licensed && hasText) text = t('autofill.readOnly');
  return text ? <p role="status" className="text-sm text-muted">{text}</p> : null;
}
