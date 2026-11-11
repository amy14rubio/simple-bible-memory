import { useEffect } from 'react';
import { useRepositories } from '../../app/repositories';
import { useTheme } from '../../app/theme';
import { onDatabaseWrite } from '../../data/writeEvents';
import { useI18n } from '../../i18n/I18nProvider';
import { pushWidgetSnapshot, widgetsAvailable } from '../../platform/widgets';
import { collectWidgetContent } from './collect';
import { buildSnapshot, type WidgetContent } from './snapshot';

/** What the widgets were last given to show (the decks, statistics and verses), kept so a new theme or language can be sent without reading the database. */
let lastContent: WidgetContent | undefined;

/**
 * Keeps the Android home-screen widgets in step with the app: the theme (including the person's own colours), the language, the due
 * decks, the statistics and the verses they may show. A fresh snapshot is sent when the app opens, when one of those settings changes,
 * and a moment after anything is saved (studying, adding, reordering...).
 */
export function useWidgetSync() {
  const { decks, cards, reviews, stats, settings } = useRepositories();
  const { preference, custom } = useTheme();
  const { language, t } = useI18n();
  const labels = {
    addCard: t('cardForm.add'),
    dueToday: t('widget.dueToday'),
    allDone: t('widget.allDone'),
    more: t('widget.more', { count: '{count}' }),
    memorized: t('stats.memorized'),
    noDecks: t('decks.emptyTitle'),
    chooseDeck: t('widget.chooseDeck'),
    chooseDeckHint: t('widget.chooseDeckHint'),
    licensedDeck: t('widget.licensedDeck'),
    openToRead: t('widget.openToRead'),
    verses: t('widget.verses', { count: '{count}' }),
    verse: t('widget.verse'),
    noVerses: t('widget.noVerses'),
    stageNew: t('stage.new'),
    stageLearning: t('stage.learning'),
    stageYoung: t('stage.young'),
    stageMature: t('stage.mature'),
  };
  const wording = JSON.stringify(labels); // so the effect runs again only when a word changes

  useEffect(() => {
    if (!widgetsAvailable()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    let again = false;
    const send = async () => {
      if (running) { again = true; return; }
      running = true;
      try {
        const content = await collectWidgetContent({ decks, cards, reviews, stats, settings });
        lastContent = content;
        await pushWidgetSnapshot(buildSnapshot({ language, theme: preference, custom, labels: JSON.parse(wording) as Record<string, string>, content, now: Date.now() }));
      } catch { /* the widgets keep what they had */ } finally {
        running = false;
        if (again) { again = false; schedule(); }
      }
    };
    // After a save, a moment's wait gathers a burst of saves into one send. This effect itself runs again only when the theme, the
    // language or a word changed (or on start), which is rare and should show on the home screen at once, so it sends almost
    // immediately: someone who switches the language and goes straight to the home screen must find the widgets already changed.
    const schedule = (delay = 1500) => { clearTimeout(timer); timer = setTimeout(() => { timer = undefined; void send(); }, delay); };
    // The colours and words go first, straight away, with the content the widgets already had (no database reads to wait for); the
    // up-to-date content follows a moment later.
    if (lastContent) void pushWidgetSnapshot(buildSnapshot({ language, theme: preference, custom, labels: JSON.parse(wording) as Record<string, string>, content: lastContent, now: Date.now() }));
    schedule(150);
    const off = onDatabaseWrite(() => schedule());
    // Leaving the app freezes the page, so whatever is waiting is sent now rather than after the wait.
    const flush = () => { if (document.visibilityState === 'hidden' && timer !== undefined) { clearTimeout(timer); timer = undefined; void send(); } };
    document.addEventListener('visibilitychange', flush);
    return () => { clearTimeout(timer); off(); document.removeEventListener('visibilitychange', flush); };
  }, [decks, cards, reviews, stats, settings, preference, custom, language, wording]);
}
