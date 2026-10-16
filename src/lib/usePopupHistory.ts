import { useLayoutEffect, useRef } from 'react';

/**
 * Makes the phone's (or browser's) Back button close an open popup instead of leaving the screen behind it.
 * While `open`, one extra history entry is on top; Back pops it and calls `close`. If the popup is closed another way
 * (Escape, tapping outside, making a choice) the extra entry is removed again, straight away. Screens that navigate
 * right after a choice should use `navigate(to, { replace: true })`, which simply swaps the extra entry for the new page.
 */
export function usePopupHistory(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const entry = useRef(false); // is our extra history entry currently on top?
  const active = useRef(false);

  // A layout effect, so closing and clean-up happen in the same moment as the tap or key press that closed it.
  useLayoutEffect(() => {
    if (!open) return;
    active.current = true;
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
      active.current = false;
      // A microtask, not a timer: it runs before the next thing anyone can do, but after React's dev-only
      // unmount-and-remount (which re-activates this hook in the same commit) has had its say.
      queueMicrotask(() => {
        if (active.current || !entry.current) return;
        entry.current = false;
        if (window.history.state?.popup) window.history.back();
      });
    };
  }, [open]);
}
