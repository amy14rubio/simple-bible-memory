import { useEffect, useRef } from 'react';

/**
 * Makes the phone's (or browser's) Back button close an open popup instead of leaving the screen behind it.
 * While `open`, one extra history entry is on top; Back pops it and calls `close`. If the popup is closed another way
 * (Escape, tapping outside, making a choice) the extra entry is removed again. Screens that navigate straight after a
 * choice should use `navigate(to, { replace: true })`, which simply swaps the extra entry for the new page.
 */
export function usePopupHistory(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const entry = useRef(false); // is our extra history entry currently on top?
  const cleanup = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!open) return;
    clearTimeout(cleanup.current); // React's dev double-run: keep the entry we already pushed
    if (!entry.current) {
      window.history.pushState({ ...window.history.state, popup: true }, '');
      entry.current = true;
    }
    const onPop = () => {
      if (!entry.current) return;
      entry.current = false;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      cleanup.current = setTimeout(() => {
        if (entry.current && window.history.state?.popup) window.history.back();
        entry.current = false;
      }, 0);
    };
  }, [open]);
}
