import { useEffect } from 'react';
import { useTheme } from '../../app/theme';
import { useI18n } from '../../i18n/I18nProvider';
import { pushWidgetSnapshot, widgetsAvailable } from '../../platform/widgets';
import { buildSnapshot } from './snapshot';

/**
 * Keeps the Android home-screen widgets in step with the app: the theme (including the person's own colours) and the language. It
 * sends a fresh snapshot when the app opens and whenever one of those changes.
 */
export function useWidgetSync() {
  const { preference, custom } = useTheme();
  const { language, t } = useI18n();
  const addCard = t('cardForm.add');
  useEffect(() => {
    if (!widgetsAvailable()) return;
    const timer = setTimeout(() => void pushWidgetSnapshot(buildSnapshot({ language, theme: preference, custom, labels: { addCard }, now: Date.now() })), 400);
    return () => clearTimeout(timer);
  }, [preference, custom, language, addCard]);
}
