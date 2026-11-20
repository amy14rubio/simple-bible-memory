import type { BibleSource } from '../../domain/bible/sources';
import { canSplit, verseReference, type SplitResult, type SplitVerse } from '../../domain/bible/split';
import { PassageError, getPassageSource } from '../../platform/youversion';

/** How many verses are asked for at the same time (the service allows only so many requests at once). */
const AT_ONCE = 4;

const problemCode = (e: unknown): 'lookup-offline' | 'lookup-busy' | 'lookup-failed' => {
  const problem = e instanceof PassageError ? e.problem : 'failed';
  return problem === 'offline' ? 'lookup-offline' : problem === 'busy' ? 'lookup-busy' : 'lookup-failed';
};

/**
 * "Split into separate verses" when Autofill is on: instead of cutting a pasted text by its verse numbers (an automatically filled passage has none),
 * the verses of the chapter or range are asked for one at a time from the chosen translation. A translation whose text belongs to a publisher is not
 * fetched here at all: its cards are saved with only the reference and the translation, and each device fills the text in itself (as for any card in it).
 * `progress` says how many verses have arrived; `cancelled` stops the lookups when the person closes the preview.
 */
export async function lookUpSplit(source: BibleSource, reference: string, progress: (done: number, total: number) => void, cancelled: () => boolean): Promise<SplitResult> {
  if (!canSplit(reference)) return { ok: false, code: 'not-splittable', message: 'Splitting works for one chapter or several verses of one chapter.' };
  let numbers: number[];
  try {
    numbers = await getPassageSource().verseNumbers(source, reference);
  } catch (e) {
    return { ok: false, code: problemCode(e), message: 'Could not look up the verses.' };
  }
  if (numbers.length < 2) return { ok: false, code: 'single-verse', message: 'This is a single verse, so there is nothing to split.' };

  const verses: SplitVerse[] = [];
  for (const verse of numbers) {
    const ref = verseReference(reference, verse);
    if (!ref) return { ok: false, code: 'cannot-split', message: 'This reference could not be split.' };
    verses.push({ verse, reference: ref, text: '' });
  }
  if (source.kind === 'licensed') return { ok: true, verses, ignored: '' };

  let done = 0;
  let failure: unknown = null;
  progress(0, verses.length);
  let next = 0;
  const worker = async () => {
    while (next < verses.length && failure === null && !cancelled()) {
      const v = verses[next++]!;
      try {
        v.text = (await getPassageSource().fetchPassage(source, v.reference)).trim();
        progress(++done, verses.length);
      } catch (e) {
        failure = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, verses.length) }, worker));
  if (failure !== null) return { ok: false, code: problemCode(failure), message: 'Could not look up the verses.' };
  if (verses.some((v) => !v.text)) return { ok: false, code: 'lookup-failed', message: 'Could not look up the verses.' };
  return { ok: true, verses, ignored: '' };
}
