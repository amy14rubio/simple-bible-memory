import { sourceFor } from '../../domain/bible/sources';
import { ensureDetails, useCatalogueVersion } from './catalogue';
import { ExternalLink } from '../../components/ExternalLink';

/**
 * The publisher's notice for a licensed text, with a link to the publisher (the agreements ask for both, in a conspicuous place
 * wherever the text is shown). `compact` is the short tag after a verse ("NASB 2020"), which is a link too; the full notice is
 * on the card's own screen. Nothing for a text that is not licensed.
 */
export function Attribution({ code, compact = false, className = '' }: { code: string | null | undefined; compact?: boolean; className?: string }) {
  useCatalogueVersion(); // looks again when the notice arrives
  ensureDetails(code);
  const source = sourceFor(code);
  const publisher = source?.publisher;
  if (!source || source.kind !== 'licensed' || !publisher) return null;
  const host = new URL(publisher.url).hostname;
  return compact ? (
    <p data-attribution={source.code} className={`text-sm text-muted ${className}`}>
      <ExternalLink href={publisher.url} className="underline underline-offset-2">{source.tag}</ExternalLink>
    </p>
  ) : (
    <p data-attribution={source.code} className={`text-sm text-muted ${className}`}>
      {publisher.notice} <ExternalLink href={publisher.url} className="underline underline-offset-2">{host}</ExternalLink>
    </p>
  );
}
