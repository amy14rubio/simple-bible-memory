import { AppBar, BackButton, Page } from '../../components/ui';
import { InfoLabel } from '../../components/InfoDrawer';
import type { MessageKey } from '../../i18n';
import { useI18n } from '../../i18n/I18nProvider';
import { CONTACT_EMAIL } from '../discover/contact';
import { ExternalLink } from '../../components/ExternalLink';
import { legalUrl } from '../../lib/site';

const SECTIONS = ['device', 'account', 'public', 'delete', 'others'] as const;

/** What is stored, where, and who can see it, in plain words. */
export function PrivacyPage() {
  const { t, language } = useI18n();
  return (
    <>
      <AppBar title={<InfoLabel title={t('privacy.title')} info={t('privacy.pageInfo')} />} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page className="space-y-7 pt-2">
        {SECTIONS.map((s) => (
          <section key={s} aria-labelledby={`privacy-${s}`} className="space-y-2">
            <h2 id={`privacy-${s}`} className="font-serif text-xl">{t(`privacy.${s}.title` as MessageKey)}</h2>
            <p>{t(`privacy.${s}.body` as MessageKey)}</p>
          </section>
        ))}
        <ul className="space-y-1 font-medium">
          <li><ExternalLink href={legalUrl('privacy-policy', language)} className="underline underline-offset-4">{t('privacy.policyLink')}</ExternalLink></li>
          <li><ExternalLink href={legalUrl('terms', language)} className="underline underline-offset-4">{t('privacy.termsLink')}</ExternalLink></li>
          <li><ExternalLink href={legalUrl('delete-account', language)} className="underline underline-offset-4">{t('privacy.deleteLink')}</ExternalLink></li>
        </ul>
        <p className="text-muted">{t('privacy.contact')} <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a></p>
      </Page>
    </>
  );
}
