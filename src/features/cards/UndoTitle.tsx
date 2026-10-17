/** A toast's text, plus a hidden sentence for screen readers saying Undo exists and where it is. */
export function UndoTitle({ text, hint }: { text: string; hint: string }) {
  return <>{text}<span className="sr-only">. {hint}</span></>;
}
