import { useEffect } from 'react';
import { isAndroidApp } from '../platform/device';

/**
 * Tells the page how much of its bottom edge the on-screen keyboard covers (CSS variable --keyboard-inset, and a `data-keyboard`
 * mark on the page while it is up), so a bar pinned to the bottom can ride up above the keyboard.
 *
 * Android makes the page itself shorter when the keyboard opens, so the bar rises on its own and this reads 0. An iPhone or iPad
 * leaves the page as tall as it was and covers its bottom with the keyboard: only the *visual* viewport (what can be seen) shrinks.
 *
 * In the Android app this does nothing at all. While the keyboard slides in, the page's height and the visible height change a few
 * milliseconds apart, so for a frame or two they disagree by the whole keyboard (measured on a Samsung A35: 314px), and a bar
 * that trusted this would fly to the top of the screen and back. The system has already made room, so the bar needs no help.
 */
export function useKeyboardInset() {
  useEffect(() => {
    if (isAndroidApp()) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      // Pinched in: the visual viewport is smaller because of the zoom, not a keyboard.
      const covered = vv.scale > 1.05 ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--keyboard-inset', `${covered}px`);
      if (covered > 80) root.setAttribute('data-keyboard', ''); else root.removeAttribute('data-keyboard');
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      root.style.removeProperty('--keyboard-inset');
      root.removeAttribute('data-keyboard');
    };
  }, []);
}
