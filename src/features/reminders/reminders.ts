import type { SettingsRepository } from '../../data/repositories/settingsRepository';
import { MAX_REMINDERS, MESSAGE_MAX, REPEATS, isTime, planNotifications, type Reminder } from '../../domain/reminders/schedule';
import { getNotifier } from '../../platform/notifications';
import type { Language } from '../../i18n';
import { translate } from '../../i18n';

/** Reminders are off until the person turns them on in Settings (and the phone asks for permission only then). */
export interface ReminderSettings {
  enabled: boolean;
  reminders: Reminder[];
}

const ENABLED_KEY = 'reminders_enabled';
const LIST_KEY = 'reminders';

/** Keeps only well-formed reminders, so a damaged or older saved value can never break Settings. */
function clean(list: unknown): Reminder[] {
  if (!Array.isArray(list)) return [];
  const out: Reminder[] = [];
  for (const r of list as Partial<Reminder>[]) {
    if (!r || typeof r.id !== 'string' || !REPEATS.includes(r.repeat as never) || !isTime(r.time) || !isTime(r.from) || !isTime(r.to)) continue;
    out.push({
      id: r.id,
      repeat: r.repeat!,
      time: r.time,
      from: r.from,
      to: r.to,
      weekday: Number.isInteger(r.weekday) && r.weekday! >= 0 && r.weekday! <= 6 ? r.weekday! : 0,
      startDay: typeof r.startDay === 'string' ? r.startDay : '1970-01-01',
      message: typeof r.message === 'string' ? r.message.slice(0, MESSAGE_MAX) : '',
    });
  }
  return out.slice(0, MAX_REMINDERS);
}

export async function loadReminderSettings(settings: SettingsRepository): Promise<ReminderSettings> {
  const [enabled, list] = await Promise.all([settings.get<boolean>(ENABLED_KEY), settings.get<unknown>(LIST_KEY)]);
  return { enabled: enabled === true, reminders: clean(list) };
}

export async function saveReminderSettings(settings: SettingsRepository, value: ReminderSettings): Promise<void> {
  await settings.set(ENABLED_KEY, value.enabled);
  await settings.set(LIST_KEY, value.reminders);
}

/** Makes the phone's scheduled notifications match the saved reminders. Safe to call as often as you like. */
export async function syncReminders(value: ReminderSettings, language: Language, now: Date = new Date()): Promise<void> {
  const notifier = getNotifier();
  if (!notifier.available) return;
  const wanted = value.enabled && (await notifier.permission()) === 'granted';
  const plan = wanted ? planNotifications(value.reminders, now, translate(language, 'reminders.defaultMessage')) : [];
  await notifier.replaceAll(plan.map((n) => ({ title: translate(language, 'app.name'), body: n.body, at: n.at })));
}
