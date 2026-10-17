import { useEffect, useState } from 'react';
import { AppBar, BackButton, CheckList, Page } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { useRepositories } from '../../app/repositories';
import type { CardKindSetting } from '../../domain/study/cardKind';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';
import { loadCardKindSetting } from '../study/cardKinds';

export const KIND_ORDER: CardKindSetting[] = ['both', 'recall', 'identify'];

/** Cards for each verse: Both, Recall the passage, or Identify the verse. The "i" explains all three. */
export function CardKindsPage() {
  const { t } = useI18n();
  const { settings } = useRepositories();
  const [kinds, setKinds] = useState<CardKindSetting>('both');
  useEffect(() => { void loadCardKindSetting(settings).then(setKinds); }, [settings]);
  const change = (k: CardKindSetting) => { setKinds(k); void settings.set('card_kinds', k); };

  return (
    <>
      <AppBar
        title={
          <InfoLabel
            title={t('settings.kindsLegend')}
            info={
              <dl className="grid gap-4">
                {KIND_ORDER.map((k) => (
                  <div key={k}>
                    <dt className="font-semibold">{t(`kinds.${k}.title` as MessageKey)}</dt>
                    <dd className="text-muted">{t(`kinds.${k}.description` as MessageKey)}</dd>
                  </div>
                ))}
              </dl>
            }
          />
        }
        back={<BackButton to="/settings" label={t('common.back')} />}
      />
      <Page className="py-0">
        <CheckList label={t('settings.kindsLegend')} name="card-kinds" value={kinds} options={KIND_ORDER.map((k) => ({ value: k, label: t(`kinds.${k}.title` as MessageKey) }))} onChange={change} />
      </Page>
    </>
  );
}
