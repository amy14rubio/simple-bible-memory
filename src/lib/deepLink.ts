import { APP_SCHEME, SITE_URL } from './site';

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const ok = (id: string | undefined) => (id && ID.test(id) ? id : null);

/**
 * The public deck a link points at, or null for any other link. Understood:
 *   simplebiblememory://discover/<id>        (the "Open in the app" button on the share page)
 *   https://<the website>/d/<id>             (the shared link itself, if a phone hands it to the app)
 *   https://<the website>/app#/discover/<id> (the web app's own address for the deck)
 */
export function deckIdFromLink(link: string): string | null {
  let url: URL;
  try { url = new URL(link); } catch { return null; }
  if (url.protocol === `${APP_SCHEME}:`) {
    // simplebiblememory://discover/abc: "discover" is read as the host
    const parts = [url.host, ...url.pathname.split('/')].filter(Boolean);
    return parts[0] === 'discover' ? ok(parts[1]) : null;
  }
  if (url.origin !== SITE_URL) return null;
  const shared = /^\/d\/([^/]+)\/?$/.exec(url.pathname);
  if (shared) return ok(decodeURIComponent(shared[1]!));
  const hash = /^#\/discover\/([^/?]+)/.exec(url.hash);
  return url.pathname === '/app' && hash ? ok(decodeURIComponent(hash[1]!)) : null;
}

/**
 * The screen a link opens (an address inside the app, like "/cards/new"), or null for any other link. Everything `deckIdFromLink`
 * understands, and the shortcuts the home-screen widgets use:
 *   simplebiblememory://add          Add card              simplebiblememory://stats       Statistics
 *   simplebiblememory://deck/<id>    a deck of the person's
 */
export function routeFromLink(link: string): string | null {
  const shared = deckIdFromLink(link);
  if (shared) return `/discover/${encodeURIComponent(shared)}`;
  let url: URL;
  try { url = new URL(link); } catch { return null; }
  if (url.protocol !== `${APP_SCHEME}:`) return null;
  const parts = [url.host, ...url.pathname.split('/')].filter(Boolean);
  if (parts[0] === 'add' && parts.length === 1) return '/cards/new';
  if (parts[0] === 'stats' && parts.length === 1) return '/stats';
  if (parts[0] === 'deck' && parts.length === 2 && ok(parts[1])) return `/decks/${encodeURIComponent(parts[1]!)}`;
  return null;
}
