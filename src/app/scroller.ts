/**
 * The one scrolling area of the app: the middle of the screen, between the top bar and the bottom tabs (AppShell makes it; the page itself does not
 * scroll). Everything that scrolls, measures or restores the scroll position asks for it here. Outside the app shell (a test, say) it is the page.
 */
export const SCROLLER_ID = 'app-scroll';
export function scroller(): HTMLElement {
  return document.getElementById(SCROLLER_ID) ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
