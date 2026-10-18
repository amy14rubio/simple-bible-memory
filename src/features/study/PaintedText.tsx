import type { Segment } from '../../domain/study/compare';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Words you got right are green, wrong ones red. Only the text color changes, never a background.
 * Wrong words also get a line (strike-through for what you typed, underline for what you missed)
 * so the meaning isn't carried by color alone. Screen readers ignore all of that, so the result also has a list of the
 * differences in words (see DifferenceList).
 */
export function PaintedText({ segments, side }: { segments: Segment[]; side: 'typed' | 'expected' }) {
  const plain = segments.filter((s) => s.state !== 'gap').map((s) => s.text).join('');
  // The colours are only for eyes: a screen reader would stop on every single word. It gets the text as one string instead.
  return (
    <>
      <span aria-hidden="true"><Painted segments={segments} side={side} /></span>
      <span className="sr-only">{plain}</span>
    </>
  );
}

function Painted({ segments, side }: { segments: Segment[]; side: 'typed' | 'expected' }) {
  const { t } = useI18n();
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
        return side === 'typed' ? (
          <del key={i} className="text-again">{s.text}</del>
        ) : (
          <mark key={i} className="bg-transparent px-0.5 text-again underline decoration-2 underline-offset-4">{s.text}</mark>
        );
      })}
    </>
  );
}
