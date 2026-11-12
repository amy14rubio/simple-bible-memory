import { useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp } from 'lucide-react';
import { toast } from '../../components/shadcn/toast';
import { AppBar, BackButton, Button, ErrorMessage, FormRow, Page, Switch } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { OptionPicker } from '../../components/OptionPicker';
import { useRepositories } from '../../app/repositories';
import { LIMITS, parseExportFile, type ExportFile, type ParseErrorCode } from '../../domain/exchange/format';
import { mapAnkiRows, parseAnkiText, type AnkiTable } from '../../domain/exchange/anki';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';

type Loaded =
  | { kind: 'deck'; file: ExportFile }
  | { kind: 'anki'; table: AnkiTable; fileName: string };

const NONE = 'none';
const ERROR_KEY: Record<ParseErrorCode | 'unreadable' | 'tooFewColumns' | 'noCards', MessageKey> = {
  'too-big': 'import.error.tooBig',
  'not-json': 'import.error.invalid',
  'not-ours': 'import.error.notOurs',
  newer: 'import.error.newer',
  invalid: 'import.error.invalid',
  empty: 'import.error.empty',
  unreadable: 'import.error.unreadable',
  tooFewColumns: 'import.error.tooFewColumns',
  noCards: 'import.error.noCards',
};

const preview = (value: string, max = 28) => { const one = value.replace(/\s+/g, ' ').trim(); return one.length > max ? `${one.slice(0, max)}…` : one; };

/**
 * Import: choose a file, see what is in it, and add it as new decks. Understands this app's own deck files and Anki's
 * "Notes in Plain Text" exports. Nothing already in the app is ever changed or overwritten.
 */
export function ImportPage() {
  const { t, describeError } = useI18n();
  const { exchange } = useRepositories();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<Loaded>();
  const [errorKey, setErrorKey] = useState<MessageKey>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // For a deck file
  const [progress, setProgress] = useState(true);
  // For an Anki file
  const [deckName, setDeckName] = useState('');
  const [verse, setVerse] = useState('0');
  const [passage, setPassage] = useState('1');
  const [source, setSource] = useState(NONE);
  const [skipFirst, setSkipFirst] = useState(false);

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still counts
    if (!f) return;
    setLoaded(undefined); setErrorKey(undefined); setError(undefined);
    if (f.size > LIMITS.fileBytes) { setErrorKey(ERROR_KEY['too-big']); return; }
    let text: string;
    try { text = await f.text(); } catch { setErrorKey(ERROR_KEY.unreadable); return; }

    if (text.trimStart().startsWith('{')) {
      const r = parseExportFile(text);
      if (!r.ok) { setErrorKey(ERROR_KEY[r.code]); return; }
      setProgress(r.file.includesProgress);
      setLoaded({ kind: 'deck', file: r.file });
      return;
    }
    const table = parseAnkiText(text);
    if (table.rows.length === 0) { setErrorKey(ERROR_KEY.noCards); return; }
    if (Math.max(...table.rows.map((r) => r.length)) < 2) { setErrorKey(ERROR_KEY.tooFewColumns); return; }
    const find = (re: RegExp, fallback: number) => { const i = table.columns?.findIndex((c) => re.test(c)) ?? -1; return String(i >= 0 ? i : fallback); };
    setVerse(find(/front|verse|reference|ref/i, 0));
    setPassage(find(/back|passage|text/i, 1));
    setSource(NONE);
    setSkipFirst(false);
    setDeckName(f.name.replace(/\.[^.]+$/, '').trim());
    setLoaded({ kind: 'anki', table, fileName: f.name });
  };

  const mapped = useMemo(
    () => (loaded?.kind === 'anki' ? mapAnkiRows(loaded.table.rows, { verse: Number(verse), passage: Number(passage), source: source === NONE ? null : Number(source), skipFirstRow: skipFirst }) : null),
    [loaded, verse, passage, source, skipFirst],
  );

  const columnOptions = useMemo(() => {
    if (loaded?.kind !== 'anki') return [];
    const width = Math.max(...loaded.table.rows.map((r) => r.length));
    const sample = loaded.table.rows[skipFirst ? 1 : 0] ?? [];
    return Array.from({ length: width }, (_, i) => {
      const name = loaded.table.columns?.[i] || t('import.column', { n: i + 1 });
      return { value: String(i), label: sample[i] ? `${name}: ${preview(sample[i]!)}` : name };
    });
  }, [loaded, skipFirst, t]);

  const canImport = loaded?.kind === 'deck' ? true : !!mapped && mapped.cards.length > 0 && deckName.trim() !== '' && verse !== passage;

  const run = async () => {
    if (!loaded) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = loaded.kind === 'deck'
        ? await exchange.importFile(loaded.file, { progress })
        : await exchange.importCards({ title: deckName }, mapped!.cards);
      toast.add({ title: t('toast.imported', { count: result.decks }), type: 'success' });
      navigate(result.deckIds.length === 1 ? `/collections/${result.deckIds[0]}` : '/', { replace: true });
    } catch (e) {
      setError(describeError(e));
      setBusy(false);
    }
  };

  const columnPicker = (label: string, value: string, onChange: (v: string) => void, options = columnOptions) => (
    <FormRow label={label}>
      {(fid) => <OptionPicker id={fid} variant="field" label={label} value={value} options={options} onChange={onChange} popupTitle={t('import.selectColumn')} searchLabel={t('import.searchColumns')} noMatch={() => t('import.noColumns')} />}
    </FormRow>
  );

  // Before a file is chosen this is the one thing to press. Afterwards Import comes first and this moves below it.
  const chooser = (
    <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border text-[0.9375rem] font-medium hover:bg-surface has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
      <FileUp size={20} aria-hidden />
      {loaded ? t('import.chooseAnother') : t('import.choose')}
      <input type="file" accept=".json,.txt,.tsv,.csv,application/json,text/plain,text/csv,text/tab-separated-values" onChange={(e) => void choose(e)} className="sr-only" />
    </label>
  );

  return (
    <>
      <AppBar
        title={<InfoLabel title={t('import.title')} info={<div className="space-y-3 text-base"><p>{t('import.info1')}</p><p>{t('import.info2')}</p></div>} />}
        back={<BackButton to="/" label={t('common.back')} />}
      />
      <Page className="space-y-6 pt-2">
        {!loaded && chooser}

        {errorKey && <ErrorMessage error={t(errorKey)} />}

        {loaded?.kind === 'deck' && (
          <>
            <section aria-label={t('import.contents')} className="rounded-3xl bg-panel px-5 py-2">
              <ul>
                {loaded.file.decks.map((d, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 border-b border-border py-3 last:border-b-0">
                    <span className="min-w-0 truncate font-serif text-lg">{d.title}</span>
                    <span className="shrink-0 text-sm text-muted">{t('import.cards', { count: d.cards.length })}</span>
                  </li>
                ))}
              </ul>
            </section>
            {loaded.file.includesProgress && (
              <div className="flex items-center justify-between gap-4 border-y border-border">
                <span id="import-progress" className="py-3">{t('import.progress')}</span>
                <Switch checked={progress} onChange={setProgress} labelledBy="import-progress" />
              </div>
            )}
          </>
        )}

        {loaded?.kind === 'anki' && mapped && (
          <>
            <div>
              <FormRow label={t('import.deckName')}>
                {(fid) => <input id={fid} value={deckName} onChange={(e) => setDeckName(e.target.value)} maxLength={LIMITS.title} className="w-full bg-transparent py-2.5 text-base" />}
              </FormRow>
              {columnPicker(t('import.colVerse'), verse, setVerse)}
              {columnPicker(t('import.colPassage'), passage, setPassage)}
              {columnPicker(t('import.colNote'), source, setSource, [{ value: NONE, label: t('import.colNone') }, ...columnOptions])}
              <div className="flex items-center justify-between gap-4 border-b border-border">
                <span id="import-header" className="py-3">{t('import.firstRow')}</span>
                <Switch checked={skipFirst} onChange={setSkipFirst} labelledBy="import-header" />
              </div>
            </div>

            <section aria-label={t('import.contents')} className="space-y-3 rounded-3xl bg-panel px-5 py-5">
              {mapped.cards.slice(0, 3).map((c, i) => (
                <div key={i}>
                  <p className="font-serif font-medium">{c.reference}</p>
                  <p className="scripture line-clamp-2 text-[0.9375rem] leading-normal text-muted">{c.verseText}</p>
                </div>
              ))}
              <p role="status" className="text-sm text-muted">
                {mapped.cards.length === 0 ? t('import.error.noCards') : t('import.ready', { count: mapped.cards.length })}
                {mapped.skipped > 0 && ` ${t('import.skipped', { count: mapped.skipped })}`}
              </p>
            </section>
            {verse === passage && <ErrorMessage error={t('import.sameColumn')} />}
          </>
        )}

        {error && <ErrorMessage error={error} />}
        {loaded && <Button className="w-full" disabled={busy || !canImport} onClick={() => void run()}>{t('import.button')}</Button>}
        {loaded && chooser}
      </Page>
    </>
  );
}
