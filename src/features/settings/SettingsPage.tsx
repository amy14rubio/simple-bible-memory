import { useEffect, useState } from 'react';
import { useRepositories } from '../../app/repositories';
import { useTheme, type ThemePreference } from '../../app/theme';
import { AppBar, BackButton, Page, Segmented } from '../../components/ui';
import { DIFFICULTIES, type Difficulty } from '../../domain/study/cloze';
import { CARD_KIND_SETTING_LABELS, type CardKindSetting } from '../../domain/study/cardKind';
import { loadCardKindSetting } from '../study/cardKinds';
import { MAX_NEW_PER_DAY, loadNewPerDay } from '../study/newPerDay';

const row = 'flex min-h-14 items-center justify-between gap-4 border-b border-border py-2';

export function SettingsPage() {
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
      <AppBar title="Settings" back={<BackButton to="/" label="Back to decks" />} />
      <Page className="space-y-10">
        <section aria-labelledby="general">
          <h2 id="general" className="mb-1 font-serif text-xl">General</h2>
          <div className={row}>
            <span id="theme-label">Theme</span>
            <Segmented<ThemePreference>
              label="Theme"
              value={preference}
              options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]}
              onChange={(p) => void setPreference(p)}
            />
          </div>
          <div className={row}>
            <label htmlFor="new-per-day">New cards per day</label>
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
          <p className="py-2 text-sm text-muted">Counted across all decks. Study cards you have never seen are introduced up to this limit each day.</p>
          <fieldset className="border-b border-border py-3">
            <legend className="mb-1 py-1">Cards for each verse</legend>
            <div className="space-y-1">
              {(Object.keys(CARD_KIND_SETTING_LABELS) as CardKindSetting[]).map((k) => (
                <label key={k} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg px-1 py-2 hover:bg-surface">
                  <input type="radio" name="card-kinds" value={k} checked={kinds === k} onChange={() => changeKinds(k)} className="mt-1 size-4 accent-[var(--foreground)]" />
                  <span>
                    <span className="block font-medium">{CARD_KIND_SETTING_LABELS[k].title}</span>
                    <span className="block text-sm text-muted">{CARD_KIND_SETTING_LABELS[k].description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className={row}>
            <span id="blanks-label">Fill-in-the-blanks difficulty</span>
            <Segmented<Difficulty>
              label="Blanks difficulty"
              value={difficulty}
              options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]}
              onChange={changeDifficulty}
            />
          </div>
          <p className="py-2 text-sm text-muted">Sets how many words are hidden in each verse. The word bank always shows 8 words.</p>
        </section>

        <section aria-labelledby="notifications">
          <h2 id="notifications" className="mb-1 font-serif text-xl">Notifications</h2>
          <p className="py-2 text-muted">Study reminders aren't available yet.</p>
        </section>

        <section aria-labelledby="backup">
          <h2 id="backup" className="mb-1 font-serif text-xl">Account and backup</h2>
          <p className="py-2 text-muted">
            You don't need an account. Your decks and progress are stored only on this device. Backup and sync aren't available yet,
            so don't clear this browser's site data if you want to keep them.
          </p>
        </section>
      </Page>
    </>
  );
}
