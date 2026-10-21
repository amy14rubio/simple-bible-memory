import { useEffect, useState } from 'react';
import { AppBar, BackButton, CheckList, Page } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { useRepositories } from '../../app/repositories';
import { DIFFICULTIES, type Difficulty } from '../../domain/study/cloze';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';

/** Fill-in-the-blanks difficulty: Easy, Medium or Hard. How many words are hidden; the word bank always shows 8. */
export function BlanksPage() {
  const { t } = useI18n();
  const { settings } = useRepositories();
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  useEffect(() => { void settings.get<Difficulty>('blank_difficulty').then((d) => d && DIFFICULTIES.includes(d) && setDifficulty(d)); }, [settings]);
  const change = (d: Difficulty) => { setDifficulty(d); void settings.set('blank_difficulty', d); };

  return (
    <>
      <AppBar title={<InfoLabel title={t('settings.blanks')} info={t('settings.blanksHint')} />} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page flush>
        <CheckList label={t('settings.blanksGroup')} name="blank-difficulty" value={difficulty} options={DIFFICULTIES.map((d) => ({ value: d, label: t(`difficulty.${d}` as MessageKey) }))} onChange={change} />
      </Page>
    </>
  );
}
