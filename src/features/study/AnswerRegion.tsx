import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Where keyboard focus goes when an answer or a result appears. Revealing it replaces the button that was pressed, so
 * without this focus falls back to the top of the page and a screen reader says nothing. Focusing a named group reads its
 * name out ("Answer: For God so loved…"), and the next swipe or Tab continues to the rating buttons.
 */
export function AnswerRegion({ label, children, className = '' }: { label: string; children?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return <div ref={ref} role="group" aria-label={label} tabIndex={-1} className={className}>{children}</div>;
}
