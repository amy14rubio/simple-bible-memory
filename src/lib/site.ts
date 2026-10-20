import type { Language } from '../i18n';

/** The website (Firebase Hosting): the web app, and the pages Google Play and people can read outside the app. */
export const SITE_URL = 'https://simple-bible-memory.web.app';

export type LegalPage = 'privacy-policy' | 'terms' | 'delete-account';
/** A legal page in the person's language: English at /privacy-policy, Spanish at /es/privacy-policy. */
export const legalUrl = (page: LegalPage, language: Language) => `${SITE_URL}${language === 'es' ? '/es' : ''}/${page}`;
