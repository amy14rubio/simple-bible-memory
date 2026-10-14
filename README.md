# Simple Bible Memory

An offline-first app for memorizing Bible verses with flashcards, typing, and fill-in-the-blanks, scheduled by FSRS spaced repetition. No account needed; everything is stored on the device in SQLite.

**Status:** browser MVP complete, with the interface redesigned to the wireframes. Android packaging (Capacitor) is on hold. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + repository integration tests (Vitest)
npm run test:e2e     # browser tests (Playwright; first run: npx playwright install chromium)
npm run build        # type-check + production build
npm run lint
```

Requires Node 20+.

## What it does

- Decks and verse cards: create, rename, edit, delete with confirmation, browse as a Verse / Passage table, search.
- Statistics: totals, memorized and mastered verses, days since starting, progress per book, and card counts by stage.
- Two study cards per verse, each scheduled separately: **recall** (you see the verse, recall the passage) and **identify** (you see the passage, name the verse). Choose both or just one in Settings.
- Three study modes: **Flashcard** (flips both ways), **Type** (type the passage, or type the verse; word-level feedback), **Blanks** (recall: fill in the missing words by tapping them from an 8-word bank that reshuffles after every tap; identify: pick the right verse from several options).
- FSRS scheduling (ts-fsrs) with a six-month cap on review gaps, review history, due queue, new-cards-per-day limit; every study session is recorded. **Extra practice** (deck menu) lets you go through every card without affecting your schedule or statistics.
- Add cards one at a time ("Add another card") or paste a chapter or verse range and **split it into one card per verse** (with a preview first).
- Rating labels are colored like Anki (Again red, Hard orange, Good green, Easy blue) and so are the new / learning / to-review counters. Only the text is colored, and light mode uses deeper shades so it stays readable.
- Light/dark/system theme, keyboard shortcuts (1-4 to rate), accessible (every screen is axe-checked in both themes).
- Design: scripture is set in Literata, the interface in Instrument Sans, with one accent (a deep oxblood).
- Optional "Find passage on Bible Gateway" link that opens the site in your browser. The app never fetches or copies Bible text.

The app ships **no Bible text**. You type or paste your own verses.

## Licenses

Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
