import { useEffect, useState } from 'react';
import { useRepositories } from '../../app/repositories';
import { useTheme, type ThemePreference } from '../../app/theme';
import { AppBar, BackButton, Page, Segmented } from '../../components/ui';
import { DIFFICULTIES, type Difficulty } from '../../domain/study/cloze';
import type { CardKindSetting } from '../../domain/study/cardKind';
import { LANGUAGES, type LanguagePreference, type MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';
import { loadCardKindSetting } from '../study/cardKinds';
import { MAX_NEW_PER_DAY, loadNewPerDay } from '../study/newPerDay';

const KIND_ORDER: CardKindSetting[] = ['both', 'recall', 'identify'];

const row = 'flex min-h-14 items-center justify-between gap-4 border-b border-border py-2';

export function SettingsPage() {
  const { t, preference: languagePreference, setPreference: setLanguagePreference } = useI18n();
  const { preference, setPreference } = useTheme();
  const { settings } = useRepositories();
  const [newPerDay, setNewPerDay] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [kinds, setKinds] = useState<CardKindSetting>('both');

  useEffect(() => {
    loadNewPerDay(settings).then((n) => setNewPerDay(String(n)));
    loadCardKindSetting(settings).then(setKinds);
    settings.get<Difficulty>('blank_difficulty').then((d) => d && DIFFICULTIES.includes(d) && setDifficulty(d));
  }, [settings]);

  const changeNew = (value: string) => {
    setNewPerDay(value);
    const n = Number(value);
    if (value !== '' && Number.isInteger(n) && n >= 0 && n <= MAX_NEW_PER_DAY) void settings.set('new_cards_per_day', n);
  };
  const changeKinds = (k: CardKindSetting) => { setKinds(k); void settings.set('card_kinds', k); };
  const changeDifficulty = (d: Difficulty) => { setDifficulty(d); void settings.set('blank_difficulty', d); };

  return (
    <>
      <AppBar title={t('settings.title')} back={<BackButton to="/" label={t('common.backToDecks')} />} />
      <Page className="space-y-10">
        <section aria-labelledby="general">
          <h2 id="general" className="mb-1 font-serif text-xl">{t('settings.general')}</h2>
          <div className={row}>
            <span>{t('settings.language')}</span>
            <Segmented<LanguagePreference>
              label={t('settings.language')}
              value={languagePreference}
              options={[{ value: 'system', label: t('settings.languageSystem') }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.name }))]}
              onChange={(l) => void setLanguagePreference(l)}
            />
          </div>
          <p className="py-2 text-sm text-muted">{t('settings.languageHint')}</p>
          <div className={row}>
            <span id="theme-label">{t('settings.theme')}</span>
            <Segmented<ThemePreference>
              label={t('settings.theme')}
              value={preference}
              options={[{ value: 'system', label: t('settings.themeSystem') }, { value: 'light', label: t('settings.themeLight') }, { value: 'dark', label: t('settings.themeDark') }]}
              onChange={(p) => void setPreference(p)}
            />
          </div>
          <div className={row}>
            <label htmlFor="new-per-day">{t('settings.newPerDay')}</label>
            <input
              id="new-per-day"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_NEW_PER_DAY}
              value={newPerDay}
              onChange={(e) => changeNew(e.target.value)}
              className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-center text-base"
            />
          </div>
          <p className="py-2 text-sm text-muted">{t('settings.newPerDayHint')}</p>
          <fieldset className="border-b border-border py-3">
            <legend className="mb-1 py-1">{t('settings.kindsLegend')}</legend>
            <div className="space-y-1">
              {KIND_ORDER.map((k) => (
                <label key={k} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg px-1 py-2 hover:bg-surface">
                  <input type="radio" name="card-kinds" value={k} checked={kinds === k} onChange={() => changeKinds(k)} className="mt-1 size-4 accent-[var(--foreground)]" />
                  <span>
                    <span className="block font-medium">{t(`kinds.${k}.title` as MessageKey)}</span>
                    <span className="block text-sm text-muted">{t(`kinds.${k}.description` as MessageKey)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className={row}>
            <span id="blanks-label">{t('settings.blanks')}</span>
            <Segmented<Difficulty>
              label={t('settings.blanksGroup')}
              value={difficulty}
              options={[{ value: 'easy', label: t('difficulty.easy') }, { value: 'medium', label: t('difficulty.medium') }, { value: 'hard', label: t('difficulty.hard') }]}
              onChange={changeDifficulty}
            />
          </div>
          <p className="py-2 text-sm text-muted">{t('settings.blanksHint')}</p>
        </section>

        <section aria-labelledby="notifications">
          <h2 id="notifications" className="mb-1 font-serif text-xl">{t('settings.notifications')}</h2>
          <p className="py-2 text-muted">{t('settings.notificationsBody')}</p>
        </section>

        <section aria-labelledby="backup">
          <h2 id="backup" className="mb-1 font-serif text-xl">{t('settings.backup')}</h2>
          <p className="py-2 text-muted">{t('settings.backupBody')}</p>
        </section>
      </Page>
    </>
  );
}
