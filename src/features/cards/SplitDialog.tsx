import { Button, Dialog } from '../../components/ui';
import type { SplitResult } from '../../domain/bible/split';

/**
 * Shows what "Split into separate verses" would create, so you can check it before any card is saved.
 * If the text could not be split, explains why instead.
 */
export function SplitDialog({ result, studyCardsPerVerse, busy, error, onCancel, onConfirm }: {
  result: SplitResult | null; studyCardsPerVerse: number; busy: boolean; error?: string; onCancel: () => void; onConfirm: () => void;
}) {
  const ok = result?.ok ? result : null;
  const n = ok?.verses.length ?? 0;

  return (
    <Dialog open={result !== null} onClose={onCancel} title="Split into separate verses">
      {result && !result.ok && (
        <>
          <p className="mb-6 text-muted">{result.message}</p>
          <div className="flex justify-end"><Button variant="secondary" onClick={onCancel}>Close</Button></div>
        </>
      )}
      {ok && (
        <>
          <p className="text-muted">
            This creates {n} {n === 1 ? 'card' : 'cards'}, one per verse.
            {studyCardsPerVerse > 1 && ` Each verse is studied both ways, so you will have ${n * studyCardsPerVerse} study cards.`}
          </p>
          {ok.ignored && <p className="mt-2 text-sm text-muted">Left out (text before verse {ok.verses[0]!.verse}): "{ok.ignored.slice(0, 80)}"</p>}
          <ol aria-label="Cards to create" tabIndex={0} className="my-4 max-h-60 space-y-3 overflow-y-auto border-y border-border py-3">
            {ok.verses.map((v) => (
              <li key={v.verse}>
                <span className="font-serif font-medium">{v.reference}</span>
                <span className="scripture line-clamp-2 block text-[0.9375rem] leading-normal text-muted">{v.text}</span>
              </li>
            ))}
          </ol>
          {error && <p role="alert" className="mb-3 text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
            <Button onClick={onConfirm} disabled={busy}>Create {n} {n === 1 ? 'card' : 'cards'}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
