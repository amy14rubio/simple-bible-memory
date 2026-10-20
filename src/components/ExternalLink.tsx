import type { ReactNode } from 'react';
import { openExternal } from '../platform/openExternal';

/** A link to a web page, opened in the device's own browser (never inside the app). Still a real link for keyboards and screen readers. */
export function ExternalLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} onClick={(e) => { e.preventDefault(); openExternal(href); }}>
      {children}
    </a>
  );
}
