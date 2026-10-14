import { useState } from 'react';
import type { Card } from '../../domain/types';
import { compareVerse, type Comparison } from '../../domain/study/compare';
import type { Rating } from '../../domain/study/rating';
import { Button } from '../../components/ui';
import { ActionBar, RatingBar } from './RatingBar';

type Result = { comparison: Comparison } | { revealedOnly: true };

export function TypeMode({ card, intervals, onRate }: { card: Card; intervals?: Record<Rating, string>; onRate: (r: Rating) => void }) {
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<Result>();

  // One button for everything: if you typed something it is checked against the verse, if not it just reveals it.
  const check = () => setResult(typed.trim() ? { comparison: compareVerse(card.verseText, typed) } : { revealedOnly: true });

  return (
    <>
      <div className="flex flex-1 flex-col gap-5 pt-6">
        <p className="text-center font-serif text-2xl font-medium tracking-tight">{card.reference}</p>
        {!result ? (
          <>
            <label className="sr-only" htmlFor="typed">Type the verse from memory</label>
            <textarea
              id="typed"
              className="scripture min-h-56 w-full flex-1 resize-none rounded-lg border border-border bg-surface px-4 py-3.5 text-lg placeholder:text-muted"
              value={typed}
              placeholder="Type the verse from memory…"
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) check(); }}
            />
          </>
        ) : (
          <div className="space-y-6">
            {'comparison' in result && <Feedback comparison={result.comparison} />}
            <section aria-label="Correct verse" className="space-y-1">
              <h2 className="text-sm font-medium text-muted">Correct verse</h2>
              <p className="scripture whitespace-pre-line text-lg">{card.verseText}</p>
            </section>
          </div>
        )}
      </div>
      <ActionBar>
        {!result ? (
          <Button className="w-full" onClick={check}>Show answer</Button>
        ) : (
          <RatingBar suggested={'comparison' in result ? result.comparison.suggestedRating : 1} intervals={intervals} onRate={onRate} />
        )}
      </ActionBar>
    </>
  );
}

function Feedback({ comparison: c }: { comparison: Comparison }) {
  return (
    <section aria-label="Your answer" className="space-y-2">
      <h2 className="text-sm font-medium text-muted">
        {c.exact ? 'Every word matched.' : `${c.matchedCount} of ${c.expectedCount} words matched.`}
      </h2>
      <p className="scripture text-lg">
        {c.ops.map((op, i) =>
          op.type === 'match' ? (
            <span key={i}>{op.word} </span>
          ) : op.type === 'missing' ? (
            <mark key={i} className="bg-transparent px-0.5 font-medium text-accent underline decoration-2 underline-offset-4" title="Missed or wrong word">{op.word} </mark>
          ) : (
            <del key={i} className="text-muted" title="Extra word">{op.word} </del>
          ),
        )}
      </p>
      {!c.exact && <p className="text-sm text-muted">Underlined words were missed or wrong. Struck-through words were extra.</p>}
    </section>
  );
}
