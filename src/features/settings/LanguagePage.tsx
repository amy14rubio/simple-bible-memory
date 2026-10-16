import { AppBar, BackButton, CheckList, Page } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import { LANGUAGES, type LanguagePreference } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';

/** The Language page: System, then each language written in its own language. Changes the app's text only. */
export function LanguagePage() {
  const { t, preference, setPreference } = useI18n();
  const options: { value: LanguagePreference; label: string }[] = [
    { value: 'system', label: t('settings.languageSystem') },
    ...LANGUAGES.map((l) => ({ value: l.code, label: l.name })),
  ];

  return (
    <>
      <AppBar
        title={<InfoLabel title={t('settings.language')} info={t('settings.languageHint')} />}
        back={<BackButton to="/settings" label={t('common.back')} />}
      />
      <Page className="py-0">
        <CheckList label={t('settings.language')} name="language" value={preference} options={options} onChange={(v) => void setPreference(v)} />
      </Page>
    </>
  );
}
