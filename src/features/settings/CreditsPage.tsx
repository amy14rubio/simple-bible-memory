import { AppBar, BackButton, Page } from '../../components/ui';
import { ExternalLink } from '../../components/ExternalLink';
import { useI18n } from '../../i18n/I18nProvider';
import type { MessageKey } from '../../i18n';
import { CREDIT_SECTIONS } from './credits';

/** "Made Possible By" (Spanish: "Reconocimientos"): a thank-you to everything the app is built on, with a link to each one's website. */
export function CreditsPage() {
  const { t } = useI18n();
  return (
    <>
      <AppBar title={t('credits.row')} back={<BackButton to="/settings" label={t('common.back')} />} />
      <Page className="space-y-7 pt-8">
        <p className="leading-relaxed">{t('credits.thanks')}</p>
        {CREDIT_SECTIONS.map((section) => (
          <section key={section.id} aria-labelledby={`credits-${section.id}`} className="space-y-3">
            <h2 id={`credits-${section.id}`} className="font-serif text-xl font-medium tracking-tight">{t(section.title)}</h2>
            <ul className="space-y-3.5">
              {section.items.map((c) => (
                <li key={c.id} className="space-y-0.5">
                  {c.name && (c.href
                    ? <ExternalLink href={c.href} className="font-medium underline underline-offset-2">{c.name}</ExternalLink>
                    : <p className="font-medium">{c.name}</p>)}
                  <p className="text-[0.9375rem] leading-normal text-muted">{t(`credits.note.${c.id}` as MessageKey)}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Page>
    </>
  );
}
