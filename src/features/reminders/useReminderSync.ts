import { useEffect } from 'react';
import { useRepositories } from '../../app/repositories';
import { useI18n } from '../../i18n/I18nProvider';
import { loadReminderSettings, syncReminders } from './reminders';

/**
 * Re-plans the phone's scheduled reminders every time the app opens (and when the language changes, since the default
 * message is in the app's language). Reminders are scheduled a little way ahead, so opening the app tops them up.
 */
export function useReminderSync() {
  const { settings } = useRepositories();
  const { language } = useI18n();
  useEffect(() => {
    void loadReminderSettings(settings).then((value) => syncReminders(value, language)).catch(() => { /* reminders are a bonus; never break the app */ });
  }, [settings, language]);
}
