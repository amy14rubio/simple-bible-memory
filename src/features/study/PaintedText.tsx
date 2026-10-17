import type { Segment } from '../../domain/study/compare';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Words you got right are green, wrong ones red. Only the text color changes, never a background.
 * Wrong words also get a line (strike-through for what you typed, underline for what you missed)
 * so the meaning isn't carried by color alone. For screen readers, which ignore all of that, each run of wrong words is
 * bracketed by hidden text: "Extra words: … end." (what you typed) or "Missed words: … end." (what the verse has).
 */
const isSpace = (s: Segment) => s.state === 'plain' && s.text.trim() === '';

export function PaintedText({ segments, side }: { segments: Segment[]; side: 'typed' | 'expected' }) {
  const { t } = useI18n();
  const neighbour = (from: number, step: 1 | -1) => {
    for (let j = from + step; j >= 0 && j < segments.length; j += step) if (!isSpace(segments[j]!)) return segments[j];
    return undefined;
  };
  return (
    <>
      {segments.map((s, i) => {
        if (s.state === 'plain') return <span key={i}>{s.text}</span>;
        if (s.state === 'gap') {
          return (
            <mark key={i} className="bg-transparent text-again">
              <span aria-hidden>{s.text}</span>
              <span className="sr-only">{t('type.missingWords')}</span>
            </mark>
          );
        }
        if (s.state === 'match') return <span key={i} className="text-good">{s.text}</span>;
        const starts = neighbour(i, -1)?.state !== 'wrong';
        const ends = neighbour(i, 1)?.state !== 'wrong';
        const start = starts && <span className="sr-only"> {t(side === 'typed' ? 'type.srExtraStart' : 'type.srMissedStart')} </span>;
        const end = ends && <span className="sr-only"> {t('type.srEnd')} </span>;
        return side === 'typed' ? (
          <span key={i}>{start}<del className="text-again">{s.text}</del>{end}</span>
        ) : (
          <span key={i}>{start}<mark className="bg-transparent px-0.5 text-again underline decoration-2 underline-offset-4">{s.text}</mark>{end}</span>
        );
      })}
    </>
  );
}
