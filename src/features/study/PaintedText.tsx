import type { Segment } from '../../domain/study/compare';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Words you got right are green, wrong ones red. Only the text color changes, never a background.
 * Wrong words also get a line (strike-through for what you typed, underline for what you missed)
 * so the meaning isn't carried by color alone.
 */
export function PaintedText({ segments, side }: { segments: Segment[]; side: 'typed' | 'expected' }) {
  const { t } = useI18n();
  return (
    <>
      {segments.map((s, i) =>
        s.state === 'plain' ? (
          <span key={i}>{s.text}</span>
        ) : s.state === 'gap' ? (
          <mark key={i} className="bg-transparent text-again" title={t('type.missed')}>
            <span aria-hidden>{s.text}</span>
            <span className="sr-only">{t('type.missingWords')}</span>
          </mark>
        ) : s.state === 'match' ? (
          <span key={i} className="text-good">{s.text}</span>
        ) : side === 'typed' ? (
          <del key={i} className="text-again" title={t('type.extra')}>{s.text}</del>
        ) : (
          <mark key={i} className="bg-transparent px-0.5 text-again underline decoration-2 underline-offset-4" title={t('type.missed')}>{s.text}</mark>
        ),
      )}
    </>
  );
}
