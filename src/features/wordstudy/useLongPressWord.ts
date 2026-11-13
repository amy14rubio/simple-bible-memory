import { useCallback, useRef, type PointerEvent } from 'react';

const HOLD_MS = 450;
const SLOP = 10; // px: a finger that moves more than this is scrolling, not pressing

/** The text node and character offset under a point on the screen (WebKit and Blink name this differently). */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

const isLetter = (c: string | undefined) => !!c && /[\p{L}\p{M}'’-]/u.test(c);

/** The word around a character offset in a text, and how far into the whole text it starts (0..1). */
export function wordAt(text: string, offset: number): { word: string; place: number; start: number } | null {
  let a = Math.min(offset, text.length);
  if (!isLetter(text[a]) && isLetter(text[a - 1])) a -= 1;
  if (!isLetter(text[a])) return null;
  let start = a, end = a;
  while (start > 0 && isLetter(text[start - 1])) start -= 1;
  while (end < text.length && isLetter(text[end])) end += 1;
  return { word: text.slice(start, end).replace(/^['’-]+|['’-]+$/g, ''), place: text.length > 1 ? start / (text.length - 1) : 0, start };
}

/**
 * Holding a finger (or the mouse) on a word of the text for a moment calls `onWord` with that word. A short tap, a swipe or a scroll does nothing,
 * and the system's own press-to-select menu is turned off on this text (the element needs `select-none` and `[-webkit-touch-callout:none]`).
 */
export function useLongPressWord(onWord: (word: string, place: number) => void) {
  const timer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = useCallback(() => { window.clearTimeout(timer.current); start.current = null; }, []);

  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const { clientX: x, clientY: y } = e;
      const root = e.currentTarget;
      start.current = { x, y };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        start.current = null;
        const caret = caretAt(x, y);
        if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return;
        const found = wordAt(caret.node.textContent ?? '', caret.offset);
        if (!found?.word) return;
        // How far into the whole text the word is (the text may be split into pieces, e.g. while some words are underlined).
        const before = document.createRange();
        before.setStart(root, 0);
        before.setEnd(caret.node, found.start);
        const total = (root.textContent ?? '').length;
        onWord(found.word, total > 1 ? before.toString().length / (total - 1) : 0);
      }, HOLD_MS);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = start.current;
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
}
