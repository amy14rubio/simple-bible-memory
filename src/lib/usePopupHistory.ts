import { useLayoutEffect, useRef } from 'react';

/**
 * Makes the phone's (or browser's) Back button close an open popup instead of leaving the screen behind it.
 * While `open`, one extra history entry is on top; Back pops it and calls `close`. If the popup is closed another way
 * (Escape, tapping outside, making a choice) the extra entry is removed again, straight away. Screens that navigate
 * right after a choice should use `navigate(to, { replace: true })`, which simply swaps the extra entry for the new page.
 *
 * Popups can be stacked (an info drawer opened from an export drawer): only the one on top answers Back, and the
 * entry a popup removes when it closes by itself is not mistaken for a Back press by the popups beneath it.
 */
interface OpenPopup { close: () => void; gone: () => void }
const stack: OpenPopup[] = [];
let ownBacks = 0; // history.back() calls we made ourselves, whose popstate events must be ignored
let installed = false;

function install() {
  if (installed) return;
  installed = true;
  window.addEventListener('popstate', () => {
    if (ownBacks > 0) { ownBacks--; return; }
    const top = stack.pop(); // a real Back press closes the popup on top, and only that one
    if (top) { top.gone(); top.close(); }
  });
}

export function usePopupHistory(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const entry = useRef(false); // is our extra history entry in place?
  const active = useRef(false);
  const me = useRef<OpenPopup>(undefined);

  // A layout effect, so closing and clean-up happen in the same moment as the tap or key press that closed it.
  useLayoutEffect(() => {
    if (!open) return;
    install();
    active.current = true;
    if (!entry.current) {
      window.history.pushState({ ...window.history.state, popup: true }, '');
      entry.current = true;
      me.current = { close: () => closeRef.current(), gone: () => { entry.current = false; } };
      stack.push(me.current);
    }
    return () => {
      active.current = false;
      // A microtask, not a timer: it runs before the next thing anyone can do, but after React's dev-only
      // unmount-and-remount (which re-activates this hook in the same commit) has had its say.
      queueMicrotask(() => {
        if (active.current || !entry.current) return;
        entry.current = false;
        const i = me.current ? stack.indexOf(me.current) : -1;
        if (i >= 0) stack.splice(i, 1);
        if (window.history.state?.popup) { ownBacks++; window.history.back(); }
      });
    };
  }, [open]);
}
