import { Button, Dialog } from '../../components/ui';
import type { SplitResult } from '../../domain/bible/split';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';

/**
 * Shows what "Split into separate verses" would create, so you can check it before any card is saved.
 * If the text could not be split, explains why instead.
 */
export function SplitDialog({ result, studyCardsPerVerse, busy, error, onCancel, onConfirm }: {
  result: SplitResult | null; studyCardsPerVerse: number; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void;
}) {
  const { t } = useI18n();
  const ok = result?.ok ? result : null;
  const n = ok?.verses.length ?? 0;

  return (
    <Dialog open={result !== null} onClose={onCancel} title={t('split.title')}>
      {result && !result.ok && (
        <>
          <p className="mb-6 text-muted">{t(`split.error.${result.code}` as MessageKey, { verse: result.verse ?? 0 })}</p>
          <div className="flex justify-end"><Button variant="secondary" onClick={onCancel}>{t('common.close')}</Button></div>
        </>
      )}
      {ok && (
        <>
          <p className="text-muted">
            {t('split.creates', { count: n })}
            {studyCardsPerVerse > 1 && ` ${t('split.bothWays', { count: n * studyCardsPerVerse })}`}
          </p>
          {ok.ignored && <p className="mt-2 text-sm text-muted">{t('split.leftOut', { verse: ok.verses[0]!.verse, text: ok.ignored.slice(0, 80) })}</p>}
          <ol aria-label={t('split.listLabel')} tabIndex={0} className="my-4 max-h-60 space-y-3 overflow-y-auto border-y border-border py-3">
            {ok.verses.map((v) => (
              <li key={v.verse}>
                <span className="font-serif font-medium">{v.reference}</span>
                <span className="scripture line-clamp-2 block text-[0.9375rem] leading-normal text-muted">{v.text}</span>
              </li>
            ))}
          </ol>
          {error && <p role="alert" className="mb-3 text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button>
            <Button onClick={onConfirm} disabled={busy}>{t('split.create', { count: n })}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
