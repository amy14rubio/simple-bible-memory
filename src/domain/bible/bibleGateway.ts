import { parseReference } from './reference';

/**
 * Bible Gateway's documented link format is https://www.biblegateway.com/passage/?search=REFERENCE&version=VERSION
 * (https://www.biblegateway.com/support/KA-01443). We omit `version`, so Bible Gateway shows the visitor's own
 * default translation and they can switch translations there.
 */
export const BIBLE_GATEWAY_ORIGIN = 'https://www.biblegateway.com';

/**
 * Search URL for a reference, or null if the text is not a recognizable reference.
 * The URL is built from the PARSED reference (known book name + digits), never from the raw text,
 * and the value is encoded by URLSearchParams, so nothing the user types can add parameters or change the host.
 */
export function bibleGatewaySearchUrl(reference: string): string | null {
  const parsed = parseReference(reference);
  if (!parsed) return null;
  const url = new URL('/passage/', BIBLE_GATEWAY_ORIGIN);
  url.searchParams.set('search', parsed.normalized);
  return url.toString();
}
