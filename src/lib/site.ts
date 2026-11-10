import type { Language } from '../i18n';

/** The website (Firebase Hosting): the web app, and the pages Google Play and people can read outside the app. */
export const SITE_URL = 'https://simple-bible-memory.web.app';

export type LegalPage = 'privacy-policy' | 'terms' | 'delete-account';
/** A legal page in the person's language: English at /privacy-policy, Spanish at /es/privacy-policy. */
export const legalUrl = (page: LegalPage, language: Language) => `${SITE_URL}${language === 'es' ? '/es' : ''}/${page}`;

/** The link to a public deck that people share. It opens a small page (public/deck-link.html) that offers the app, the web app and the stores. */
export const deckShareUrl = (id: string) => `${SITE_URL}/d/${encodeURIComponent(id)}`;

/** The app's own address scheme: simplebiblememory://discover/<deck id> opens a public deck in the installed app. */
export const APP_SCHEME = 'simplebiblememory';
