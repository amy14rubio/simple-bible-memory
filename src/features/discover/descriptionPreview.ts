/**
 * The first line of a shared deck's description, for the Discover list: it keeps long descriptions from making the list feel
 * heavy, so decks with similar titles stay easy to tell apart. `more` says there was text after the first line (the list shows
 * "…"). A line that is too wide for the screen is cut with "…" by the page's styling. The full text is on the deck's own page.
 */
export function descriptionPreview(description: string | null | undefined): { text: string; more: boolean } | null {
  const lines = (description ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return { text: lines[0]!, more: lines.length > 1 };
}
