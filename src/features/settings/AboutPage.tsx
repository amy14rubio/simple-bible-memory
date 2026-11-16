import { AppBar, BackButton, Page } from '../../components/ui';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * A short, personal message from the person who made the app (the same one as on the website's landing page). Text only, on purpose: no links
 * (the website has a donation button, which does not belong inside the app) and no pictures (the website's show licensed Bible text).
 */
export function AboutPage() {
  const { t } = useI18n();
  return (
    <>
      <AppBar title={t('about.row')} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page className="space-y-4 pt-8">
        <h2 className="font-serif text-2xl font-medium">{t('about.hello')}</h2>
        <p className="leading-relaxed">{t('about.p1')}</p>
        <p className="leading-relaxed">{t('about.p2')}</p>
        <p className="leading-relaxed">{t('about.p3')}</p>
        <p className="pt-2 leading-relaxed">{t('about.signoff')}</p> {/* the same type as the paragraphs above it, as on the website; only the space before it is a little bigger */}
      </Page>
    </>
  );
}
