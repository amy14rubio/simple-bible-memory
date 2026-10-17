import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { useAsync } from '../../app/useAsync';
import { AppBar, BackButton, ErrorMessage, FormRow, IconButton, Page, rowInput } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
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

  if (notFound) return <><AppBar back={<BackButton to="/" label={t('common.backToDecks')} />} /><Page><ErrorMessage error={t('error.deckGone')} /></Page></>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const details = { title, description, translationCode: translation.translation, bibleLanguage: translation.language };
      if (id) { await decks.update(id, details); navigate(`/decks/${id}`, { replace: true }); }
      else { const d = await decks.create(details); navigate(`/decks/${d.id}`, { replace: true }); }
    } catch (err) { setError(describeError(err)); }
  };

  return (
    <form id="deck-form" onSubmit={submit}>
      <AppBar
        title={id ? t('deckForm.rename') : t('deckForm.new')}
        back={<BackButton label={t('common.cancel')} />}
        actions={<IconButton type="submit" label={t('common.save')}><Check size={22} aria-hidden /></IconButton>}
      />
      <Page className="space-y-4 pt-2">
        {error && <ErrorMessage error={error} />}
        <FormRow label={t('deckForm.title')}>{(fid) => <input id={fid} className={rowInput} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder={t('deckForm.titlePlaceholder')} />}</FormRow>
        <FormRow label={t('deckForm.description')}>{(fid) => <input id={fid} className={rowInput} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('common.optional')} />}</FormRow>
        <TranslationFields value={translation} onChange={setTranslation} />
      </Page>
    </form>
  );
}
