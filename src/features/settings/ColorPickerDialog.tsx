import { Suspense, lazy, useEffect, useRef } from 'react';
import { HiddenClose, showDialog } from '../../components/ui';
import { usePopupHistory } from '../../lib/usePopupHistory';
import { useI18n } from '../../i18n/I18nProvider';

const ColorPickerBody = lazy(() => import('./ColorPickerBody'));

/**
 * A colour picker in a centered dialog, like the Fonts picker: tap a swatch, drag across the square and the rainbow, and
 * the app recolours as you go. There is no Done button: tap outside, swipe, press Back or Escape and the colour stays.
 */
export function ColorPickerDialog({ open, label, value, onChange, onClose }: { open: boolean; label: string; value: string; onChange: (hex: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  usePopupHistory(open, onClose);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    showDialog(d, open);
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={t('customTheme.pickerFor', { label })}
      className="m-auto w-[min(22rem,calc(100%-2rem))] overflow-hidden rounded-3xl border border-border bg-background p-0 text-foreground backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-4 pt-5">
        <h2 className="min-w-0 truncate font-serif text-xl font-medium tracking-tight">{label}</h2>
        {/* The colour so far, small, at the right end of the title row. */}
        <span role="img" aria-label={t('customTheme.colorPreview', { label })} className="size-7 shrink-0 rounded-full border border-border" style={{ background: value }} />
      </div>
      {open && (
        <Suspense fallback={<div className="h-80" />}>
          <ColorPickerBody label={label} value={value} onChange={onChange} />
        </Suspense>
      )}
      <HiddenClose label={t('common.close')} onClick={onClose} />
    </dialog>
  );
}
