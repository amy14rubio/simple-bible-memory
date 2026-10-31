import { useEffect, useRef, useState } from 'react';
import type { BibleSource } from '../../domain/bible/sources';
import { parseReference } from '../../domain/bible/reference';
import { getPassageSource, PassageError, type PassageProblem } from '../../platform/youversion';

export type AutofillState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok' } | { kind: 'offline' } | { kind: 'problem'; problem: Exclude<PassageProblem, 'offline'> };

/**
 * Fills in the passage for the reference typed in the card form, from the chosen translation: a moment after the person stops
 * typing a reference that makes sense. `skipFor` is the reference and translation the form already holds text for (when editing
 * a card), so opening the form does not replace it.
 */
export function useAutofill({ source, reference, skipFor, onText }: { source: BibleSource | undefined; reference: string; skipFor?: string; onText: (text: string) => void }): AutofillState {
  const [state, setState] = useState<AutofillState>({ kind: 'idle' });
  const have = useRef(skipFor ?? '');
  const deliver = useRef(onText);
  deliver.current = onText;
  const key = source ? `${source.code}|${reference.trim()}` : '';

  useEffect(() => {
    if (!source || !parseReference(reference)) { setState({ kind: 'idle' }); return; }
    if (key === have.current) { setState({ kind: 'idle' }); return; }
    have.current = ''; // the text in the form (if any) is for another reference or translation now
    let stale = false;
    const timer = setTimeout(async () => {
      setState({ kind: 'loading' });
      try {
        const text = await getPassageSource().fetchPassage(source, reference);
        if (stale) return;
        have.current = key;
        deliver.current(text);
        setState({ kind: 'ok' });
      } catch (e) {
        if (stale) return;
        const problem = e instanceof PassageError ? e.problem : 'failed';
        setState(problem === 'offline' ? { kind: 'offline' } : { kind: 'problem', problem });
      }
    }, 500);
    return () => { stale = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already says everything that matters about `source` and `reference`
  }, [key]);

  return state;
}
