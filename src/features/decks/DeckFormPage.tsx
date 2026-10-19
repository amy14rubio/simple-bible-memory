import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, ErrorMessage, FormRow, GrowingTextarea, IconButton, Page, rowInput } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { toast } from '../../components/shadcn/toast';
import { ValidationError } from '../../domain/errors';
import { LIMITS } from '../../domain/sharing/translations';
import { TranslationFields, type TranslationValue } from '../sharing/TranslationFields';

/** One form for both "New deck" (/decks/new) and "Rename deck" (/decks/:id/edit). */
export function DeckFormPage() {
  const { id } = useParams();
  const { decks } = useRepositories();
  const { data: existing, loading } = useAsync(async () => (id ? decks.get(id) : undefined), [id, decks]);
  if (id && loading) return null;
  return <DeckForm key={existing?.id ?? 'new'} id={id} initialTitle={existing?.title ?? ''} initialDescription={existing?.description ?? ''} initialTranslation={{ translation: existing?.translationCode ?? null, language: existing?.bibleLanguage ?? null }} notFound={!!id && !existing} />;
}

function DeckForm({ id, initialTitle, initialDescription, initialTranslation, notFound }: { id?: string; initialTitle: string; initialDescription: string; initialTranslation: TranslationValue; notFound: boolean }) {
  const { t, describeError } = useI18n();
  const { decks } = useRepositories();
  const navigate = useNavigate();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [translation, setTranslation] = useState(initialTranslation);
  const [error, setError] = useState<string>();
  const [titleInvalid, setTitleInvalid] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);

  if (notFound) return <><AppBar back={<BackButton to="/" label={t('common.backToDecks')} />} /><Page><ErrorMessage error={t('error.deckGone')} /></Page></>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const details = { title, description, translationCode: translation.translation, bibleLanguage: translation.language };
      if (id) { await decks.update(id, details); navigate(`/decks/${id}`, { replace: true }); }
      else {
        const d = await decks.create(details);
        navigate(`/decks/${d.id}`, { replace: true });
        toast.add({ title: t('toast.deckCreated', { title: d.title }), type: 'success' }); // heard by screen readers too
      }
    } catch (err) {
      setError(describeError(err));
      // Say which field is wrong (and put the cursor in it), not just that something is.
      const bad = err instanceof ValidationError && err.code === 'deck-title-required';
      setTitleInvalid(bad);
      if (bad) titleInput.current?.focus();
    }
  };

  return (
    <form id="deck-form" onSubmit={submit}>
      <AppBar
        titleId="form-heading"
        title={id ? t('deckForm.rename') : t('deckForm.new')}
        back={<BackButton label={t('common.cancel')} />}
        actions={<IconButton type="submit" label={t('common.save')}><Check size={22} aria-hidden /></IconButton>}
      />
      <Page className="space-y-4 pt-2">
        {error && <ErrorMessage id="form-error" error={error} />}
        <FormRow label={t('deckForm.title')}>{(fid) => <input id={fid} ref={titleInput} aria-invalid={titleInvalid || undefined} aria-describedby={titleInvalid ? 'form-heading form-error' : 'form-heading'} className={rowInput} value={title} onChange={(e) => { setTitle(e.target.value); setTitleInvalid(false); setError(undefined); }} autoFocus placeholder={t('deckForm.titlePlaceholder')} />}</FormRow>
        <TranslationFields value={translation} onChange={setTranslation} />
        {/* The description is a growing box under the other fields, like the Passage on the card form. */}
        <div className="space-y-2">
          <label htmlFor="deck-description" className="flex min-h-11 items-center text-[0.9375rem] font-medium">{t('deckForm.description')}</label>
          <GrowingTextarea id="deck-description" value={description} maxLength={LIMITS.description} onChange={(e) => setDescription(e.target.value)} placeholder={t('common.optional')} />
        </div>
      </Page>
    </form>
  );
}
