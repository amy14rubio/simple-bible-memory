import { AppBar, BackButton, Page } from '../../components/ui';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';
import { CONTACT_EMAIL } from '../discover/contact';

const SECTIONS = ['device', 'account', 'public', 'delete', 'others'] as const;

/** What is stored, where, and who can see it, in plain words. */
export function PrivacyPage() {
  const { t } = useI18n();
  return (
    <>
      <AppBar title={t('privacy.title')} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page className="space-y-7 pt-2">
        <p className="text-muted">{t('privacy.intro')}</p>
        {SECTIONS.map((s) => (
          <section key={s} aria-labelledby={`privacy-${s}`} className="space-y-2">
            <h2 id={`privacy-${s}`} className="font-serif text-xl">{t(`privacy.${s}.title` as MessageKey)}</h2>
            <p>{t(`privacy.${s}.body` as MessageKey)}</p>
          </section>
        ))}
        <p className="text-muted">{t('privacy.contact')} <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a></p>
      </Page>
    </>
  );
}
