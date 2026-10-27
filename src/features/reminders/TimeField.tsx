import { useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { rowInput } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { formatTime } from './format';

/** iPhone and iPad (the app, and Safari on them, including an iPad that says it is a Mac). */
export const onApple = (): boolean =>
  Capacitor.getPlatform() === 'ios' || /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * A time shown as a button, like Google Calendar's: it reads "8:00 PM" and tapping it opens the phone's own clock
 * (which also has a keyboard mode for typing a time). The value is always "HH:MM" on a 24-hour clock.
 */
export function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (hhmm: string) => void }) {
  const { language } = useI18n();
  const clock = useRef<HTMLInputElement>(null);
  const shown = formatTime(language, value);
  // Safari on iPhone and iPad will not open a hidden clock from a button (showPicker() and click() do nothing there): only a finger on the
  // field itself opens it. So there the clock field sits right on top of the button, invisible, and is what gets tapped.
  const apple = onApple();
  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        aria-label={`${label}, ${shown}`}
        aria-haspopup="dialog"
        onClick={apple ? undefined : () => (clock.current?.showPicker ? clock.current.showPicker() : clock.current?.click())}
        className={`${rowInput} text-left tabular-nums`}
      >
        {shown}
      </button>
      {/* The phone's own clock: a time field nobody sees or tabs to, which the button above opens. */}
      <input ref={clock} type="time" value={value} data-time-for={label} tabIndex={-1} aria-hidden className={`absolute inset-0 size-full opacity-0 ${apple ? '' : 'pointer-events-none'}`} onChange={(e) => e.target.value && onChange(e.target.value)} />
    </div>
  );
}
