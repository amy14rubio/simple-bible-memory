import { useRef } from 'react';
import { rowInput } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';
import { formatTime } from './format';

/**
 * A time shown as a button, like Google Calendar's: it reads "8:00 PM" and tapping it opens the phone's own clock
 * (which also has a keyboard mode for typing a time). The value is always "HH:MM" on a 24-hour clock.
 */
export function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (hhmm: string) => void }) {
  const { language } = useI18n();
  const clock = useRef<HTMLInputElement>(null);
  const shown = formatTime(language, value);
  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        aria-label={`${label}, ${shown}`}
        aria-haspopup="dialog"
        onClick={() => (clock.current?.showPicker ? clock.current.showPicker() : clock.current?.click())}
        className={`${rowInput} text-left tabular-nums`}
      >
        {shown}
      </button>
      {/* The phone's own clock: a time field nobody sees or tabs to, which the button above opens. */}
      <input ref={clock} type="time" value={value} data-time-for={label} tabIndex={-1} aria-hidden className="pointer-events-none absolute inset-0 opacity-0" onChange={(e) => e.target.value && onChange(e.target.value)} />
    </div>
  );
}
