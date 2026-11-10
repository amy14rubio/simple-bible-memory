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
