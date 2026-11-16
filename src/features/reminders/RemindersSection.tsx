import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { useRepositories } from '../../app/repositories';
import { Switch, ErrorMessage } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { MAX_REMINDERS, newReminder, type Reminder } from '../../domain/reminders/schedule';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { getNotifier } from '../../platform/notifications';
import { isAndroidApp } from '../../platform/device';
import { loadReminderSettings, saveReminderSettings, syncReminders, type ReminderSettings } from './reminders';
import { ReminderDrawer } from './ReminderDrawer';
import { formatTime, weekdayName } from './format';

const row = 'flex min-h-13 items-center justify-between gap-4 border-b border-border py-1.5';

/**
 * The Settings section for study reminders: a switch, then the reminders themselves (at most two) and a button to add one.
 * Reminders are off at first. The phone's "Allow notifications?" question appears only when the person turns the switch on.
 */
export function RemindersSection() {
  const { t, language } = useI18n();
  const { settings } = useRepositories();
  const notifier = getNotifier();
  const [state, setState] = useState<ReminderSettings>({ enabled: false, reminders: [] });
  const [loaded, setLoaded] = useState(false); // the switch waits for the saved settings, so a quick tap is never overwritten by them
  const [error, setError] = useState<string>();
  // null: closed. A reminder: editing it (or a brand-new one that is not in the list yet).
  const [editing, setEditing] = useState<Reminder | null>(null);

  useEffect(() => {
    // `cancelled`: an older load (React runs effects twice in development) must never overwrite a newer change.
    let cancelled = false;
    void loadReminderSettings(settings).then((v) => { if (!cancelled) { setState(v); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [settings]);

  const commit = useCallback(async (next: ReminderSettings) => {
    setState(next);
    await saveReminderSettings(settings, next);
    await syncReminders(next, language);
  }, [settings, language]);

  const toggle = async (on: boolean) => {
    setError(undefined);
    if (!on) return commit({ ...state, enabled: false });
    if ((await notifier.requestPermission()) !== 'granted') {
      setError(t('reminders.denied'));
      return;
    }
    // The first time, start with one ordinary daily reminder so the switch does something straight away.
    const reminders = state.reminders.length ? state.reminders : [newReminder(new Date(), crypto.randomUUID())];
    return commit({ enabled: true, reminders });
  };

  /** A new reminder, confirmed with "Add": it joins the list and the sheet closes. */
  const add = (r: Reminder) => {
    setEditing(null);
    return commit({ ...state, reminders: [...state.reminders, r] });
  };
  /** An existing reminder was changed in the sheet: it is saved at once and the sheet stays open. */
  const change = (r: Reminder) => commit({ ...state, reminders: state.reminders.map((x) => (x.id === r.id ? r : x)) });
  const remove = (id: string) => {
    const reminders = state.reminders.filter((x) => x.id !== id);
    setEditing(null);
    // With nothing left to remind about, the switch goes back to off.
    return commit({ enabled: reminders.length > 0 && state.enabled, reminders });
  };

  const summary = (r: Reminder) => {
    // In Spanish the one o'clock hour is "a la 1:00 PM", every other hour "a las 8:00 PM".
    const one = language === 'es' && Number(r.time.slice(0, 2)) % 12 === 1;
    const key = `reminders.summary.${r.repeat}${one ? 'One' : ''}` as MessageKey;
    return t(key, { time: formatTime(language, r.time), day: weekdayName(language, r.weekday) });
  };

  return (
    <div role="group" aria-labelledby="reminders">
      <h2 id="reminders" className="mb-2.5 px-2 font-serif text-xl">
        {/* On Android only: an "i" with what to do when reminders arrive late (the system can hold a not-exact reminder back). */}
        {notifier.available && isAndroidApp() ? <InfoLabel title={t('settings.reminders')} info={t('reminders.androidTip')} className="-my-2.5" /> : t('settings.reminders')}
      </h2>
      <div className="rounded-3xl bg-panel px-5 py-1 [&>*:last-child]:border-b-0">
      {!notifier.available ? (
        <div data-coach="reminders" className={row}>
          <span id="reminders-switch-label" className="sr-only">{t('reminders.switch')}</span>
          <InfoLabel title={t('reminders.switch')} info={t('reminders.unavailable')} />
          <Switch checked={false} labelledBy="reminders-switch-label" onChange={() => {}} disabled />
        </div>
      ) : (
        <>
          <div data-coach="reminders" className={row}>
            <span id="reminders-switch-label">{t('reminders.switch')}</span>
            <Switch checked={state.enabled} labelledBy="reminders-switch-label" onChange={(on) => void toggle(on)} disabled={!loaded} />
          </div>
          {error && <div className="pt-2"><ErrorMessage error={error} /></div>}
          {state.enabled && (
            <>
              <ul aria-label={t('reminders.list')}>
                {state.reminders.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setEditing(r)} className={`${row} w-full text-left hover:bg-surface`}>
                      <span className="min-w-0">
                        <span className="block">{summary(r)}</span>
                        <span className="block truncate text-sm text-muted">{r.message.trim() || t('reminders.defaultMessage')}</span>
                      </span>
                      <ChevronRight size={20} aria-hidden className="shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
              {state.reminders.length < MAX_REMINDERS && (
                <button type="button" onClick={() => setEditing(newReminder(new Date(), crypto.randomUUID()))} className={`${row} w-full justify-start text-left hover:bg-surface`}>
                  <Plus size={20} aria-hidden className="shrink-0" />
                  <span>{t('reminders.add')}</span>
                </button>
              )}
            </>
          )}
        </>
      )}
      </div>
      <ReminderDrawer
        reminder={editing}
        isNew={editing !== null && !state.reminders.some((x) => x.id === editing.id)}
        onChange={(r) => void change(r)}
        onAdd={(r) => void add(r)}
        onDelete={(id) => void remove(id)}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
