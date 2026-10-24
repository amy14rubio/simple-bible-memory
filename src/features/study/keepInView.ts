/**
 * Scrolls the page just enough that `el` is fully visible in the part of the screen a person can actually see while studying: below
 * the sticky header and above the pinned bottom bar (the word bank, the answer options, the buttons). An element that is already
 * comfortably in view is left alone, so the page never jumps for no reason; one that is taller than that space is lined up with its
 * top. Without any animation when the person has asked their device for reduced motion.
 */
export function keepInView(el: HTMLElement | null | undefined, margin = 16) {
  if (!el || typeof window === 'undefined') return;
  const headerBottom = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0;
  const barTop = document.querySelector('[data-action-bar]')?.getBoundingClientRect().top ?? window.innerHeight;
  const top = headerBottom + margin;
  const bottom = barTop - margin;
  const rect = el.getBoundingClientRect();
  if (rect.top >= top && rect.bottom <= bottom) return;
  const room = bottom - top;
  const target = rect.height >= room ? top : top + (room - rect.height) / 2; // taller than the space: show its start; else centre it
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollBy({ top: rect.top - target, behavior: reduced ? 'auto' : 'smooth' });
}
