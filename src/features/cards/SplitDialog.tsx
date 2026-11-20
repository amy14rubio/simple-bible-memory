import { Button, Dialog, ErrorMessage, type ErrorValue } from '../../components/ui';
import type { SplitResult } from '../../domain/bible/split';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';

/**
 * Shows what "Split into separate verses" would create, so you can check it before any card is saved.
 * If the text could not be split, explains why instead.
 */
export function SplitDialog({ result, lookup = null, licensed = false, studyCardsPerVerse, busy, error, onCancel, onConfirm }: {
  result: SplitResult | null;
  /** The verses are being looked up (Autofill is on): how many have arrived out of how many. */
  lookup?: { done: number; total: number } | null;
  /** The translation's text belongs to a publisher: the cards are saved without it, and each device fills it in. */
  licensed?: boolean;
  studyCardsPerVerse: number; busy: boolean; error?: ErrorValue; onCancel: () => void; onConfirm: () => void;
}) {
  const { t } = useI18n();
  const ok = result?.ok ? result : null;
  const n = ok?.verses.length ?? 0;

  return (
    <Dialog open={result !== null || lookup !== null} onClose={onCancel} title={t('split.title')} closeOnBack closeLabel={result && !result.ok ? t('common.close') : t('common.cancel')}>
      {lookup && (
        <p role="status" className="text-muted">{lookup.total > 0 ? t('split.lookingUpCount', { done: lookup.done, total: lookup.total }) : t('split.lookingUp')}</p>
      )}
      {result && !result.ok && (
        <p className="text-muted">{t(`split.error.${result.code}` as MessageKey, { verse: result.verse ?? 0 })}</p>
      )}
      {ok && (
        <>
          <p className="text-muted">
            {t('split.creates', { count: n })}
            {studyCardsPerVerse > 1 && ` ${t('split.bothWays', { count: n * studyCardsPerVerse })}`}
          </p>
          {licensed && <p className="mt-2 text-sm text-muted">{t('split.licensedNote')}</p>}
          {ok.ignored && <p className="mt-2 text-sm text-muted">{t('split.leftOut', { verse: ok.verses[0]!.verse, text: ok.ignored.slice(0, 80) })}</p>}
          <ol aria-label={t('split.listLabel')} tabIndex={0} className="my-4 max-h-60 space-y-3 overflow-y-auto border-y border-border py-3">
            {ok.verses.map((v) => (
              <li key={v.verse}>
                <span className="font-serif font-medium">{v.reference}</span>
                {v.text && <span className="scripture line-clamp-2 block text-[0.9375rem] leading-normal text-muted">{v.text}</span>}
              </li>
            ))}
          </ol>
          {error && <div className="mb-3"><ErrorMessage error={error} /></div>}
          <Button className="w-full" onClick={onConfirm} disabled={busy}>{t('split.create', { count: n })}</Button>
        </>
      )}
    </Dialog>
  );
}
