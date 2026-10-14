# Architecture

## Layers

```
src/
  app/          providers (database, repositories, theme), shell, routing helpers
  components/   small shared UI (Button, Dialog, Field, ...)
  features/     screens: decks, cards, study, settings
  domain/       pure TypeScript, no React / SQL: study logic, scheduling, Bible references
  data/         Database interface, adapters, migrations, repositories
  platform/     things that differ per platform (opening external links)
  styles/       design tokens (CSS variables) for light and dark
```

Rules: screens call repositories; only `data/repositories` writes SQL; only `data/database` imports a SQLite driver; only `domain/scheduling/scheduler.ts` imports ts-fsrs.

## Interface language (i18n)

The interface language is separate from the Bible text: a deck's verses are whatever translation the learner typed or pasted, and are never translated. Only text the app itself writes is.

- `src/i18n/messages.en.ts` is the source of truth: flat keys, `{placeholders}`, and `{ one, other }` for words that change with a number. `messages.es.ts` is typed `Dictionary`, so the compiler fails if a key is missing, and `i18n.test.ts` checks the placeholders and plural shapes match and that nothing was left untranslated.
- No library: `translate()` fills placeholders, picks singular/plural with `Intl.PluralRules`, and writes numbers the way the language does (`1,1 años`). `I18nProvider` / `useI18n()` give screens `t()`, `formatInterval()`, `bookName()` and `describeError()`.
- The setting is `language` in the `settings` table: `system` (default: the browser's first supported language, else English), `en` or `es`. A small localStorage cache (and an inline script in `index.html`) applies it before first paint, like the theme. `<html lang>` and the page title follow it.
- Things that are not plain text were made language-aware: interval labels (`10m` / `10 min`, `6mo` / `6 meses`), book names in Statistics (Psalm / Salmos), rating labels, and error messages. Validation errors and split failures carry a **code** (`ValidationError.code`, `SplitResult.code`), and the screen turns the code into text, so the domain and data layers stay language-free.
- Outside the provider (the crash screen and the database loading screen) text is read with `currentLanguage()`.

**To add a language** (say French): copy `messages.es.ts` to `messages.fr.ts` and translate it; add `{ code: 'fr', name: 'Français' }` to `LANGUAGES` and the dictionary to `dictionaries` in `src/i18n/index.ts` (and `"fr"` to the `supported` list in `index.html`); optionally add book names like `books.es.ts`. Type-checking and the tests list anything missing.

Not translated on purpose: verse text, references, deck names, the Bible Gateway link (it always searches with the English book name), and technical database error messages.

## Screens and design

Routes (HashRouter): `/` decks home (only screen with the bottom bar; shows how many cards are due per deck) · `/decks/new` · `/decks/:id` open-deck view (study tiles + card counts) · `/decks/:id/cards` card browse · `/decks/:id/edit` · `/decks/:id/study/:mode` · `/cards/new` · `/cards/:id/edit` · `/stats` · `/settings`.

**Splitting a passage into verses** (`domain/bible/split.ts`): finds each verse's number in the pasted text, in order (plain, `[2]`, `(2)` and superscript numbers), cuts the text there, and writes each card's reference in the same style as the original (`Salmos 130:2`). It works for a whole chapter or verses within one chapter, not across chapters. A preview is shown before anything is created, and all cards are saved in one transaction. Known limit: a stray number inside a verse is only a problem if it equals the next verse's number; the preview is how you would notice.

Wireframe items deliberately **not** built: Discover/community catalog, Speak mode (shown as a disabled tile), deck options, custom study, share/shortcut, notifications, backup/account, "split into separate verses", and the card-browse filter button.

Rating colors (Again red, Hard orange, Good green, Easy blue) are TEXT colors only, per theme, each at least 4.5:1 on the page (light mode uses a deeper blue for Easy; dark mode true light blue). Buttons are outlined, never filled.

Design tokens live in `src/styles/tokens.css` (CSS variables; the dark theme only swaps values). Palette: ink on cool paper plus one oxblood accent. Fonts are self-hosted so they work offline: Literata for scripture and titles (`.scripture` class), Instrument Sans for the interface. Contrast targets: muted text 6:1+, accent 8:1+ on the background in both themes.

Statistics definitions: *memorized* = every study card in use for the verse is in the Review state; *mastered* = every one is Review with a 21+ day interval; card counts are of study cards (a verse can have two); *days since starting* = calendar days since the first review; per-book progress groups cards by the book parsed from the reference (English or Spanish names).

## Database

SQLite everywhere, behind a three-method `Database` interface (`query`, `run`, `transaction`).

| | Browser (now) | Android / iOS (Phase 7) |
|---|---|---|
| Driver | wa-sqlite (WebAssembly) | @capacitor-community/sqlite |
| Storage | SQLite pages in IndexedDB (IDBBatchAtomicVFS, strict durability) | a real SQLite file in the app's private storage |
| Eviction | The browser may delete site data under storage pressure. We request persistent storage at startup; it is a request, not a guarantee. | Not subject to browser eviction. Removed on uninstall. |
| Backup | None unless the user exports (deferred). Clearing site data deletes everything. | OS backup rules may include app data, but do not rely on it. |
| Scope | Per origin (localhost:5173 and a deployed URL have separate data) | Per app |

Both run the same `.sql` migrations. Migrations are tracked with `PRAGMA user_version`, run in a transaction each, and re-check the version inside the transaction (safe with two tabs open). Never edit a shipped migration; add a new one.

Conventions: UUID text ids; UTC epoch-millisecond integer timestamps; foreign keys on; cascade deletes.

## Study and scheduling

**Two study cards per verse ("kinds").** `recall`: you see the verse reference and recall the passage. `identify`: you see the passage and name the verse. Each has its own row in `card_schedule` (key: card id + kind) and its own FSRS state. Settings choose `both` (default), `recall` or `identify`. Migration 0002 added the kind column and assigned all existing schedules and reviews to `recall`.

How each mode treats each kind: Flashcard flips both ways (self-rated). Type: recall = type the passage (word-level diff); identify = type the verse (read as a Bible reference, so `jn 3:16`, `John 3:16` and `Juan 3:16` match). Blanks: recall = fill in missing words from a word bank (always 8 words: the word that belongs plus others from the verse and deck, rebuilt and reshuffled for every blank, nothing used up; filled in order: a right tap just fills in, a wrong tap fills in the correct word in red; the difficulty, set only in Settings, controls how many words are hidden); identify = multiple choice (options come from your other cards, then near-miss references in the same style; with fewer than three options it falls back to typing).

**Siblings.** A verse's two cards are independent and can both come up on the same day (recall is listed before identify). "New cards per day" counts study cards. The home list and the open-deck screen show only how many cards are due today.

**Extra practice** (deck menu, `?practice=1`): every card in the deck, never recorded, never in statistics. Regular study always records.

- Text comparison rules (case, punctuation, apostrophes, hyphens, accents) are documented in `domain/study/normalize.ts` and tested.
- Ratings from typed/blank modes are only *suggestions* (perfect = Good, 90%+ = Hard, else Again; never Easy). The learner decides.
- FSRS: ts-fsrs 5.4.2 (FSRS-6), default parameters, fuzz off (deterministic), requested retention 0.9, learning steps 1m/10m, relearning 10m. No parameter optimization yet. `card_schedule.scheduler_version` records which engine wrote a row.
- A card with no `card_schedule` row is new. A review writes the schedule and a `review_logs` row in one transaction.
- Cards rated Again/Hard in learning come back later in the same session (due within 20 minutes).
- Regular study always records: every rating drives the schedule. When nothing is due, the open-deck screen says when the next review is (or that today's new-card limit is reached).
- **Six-month cap.** Review gaps are capped at 180 days. ts-fsrs's own `maximum_interval` is not a strict ceiling (a chain of Easy ratings can exceed it), so `scheduler.ts` also clamps every result and every interval preview. Stability is left as computed, which is fine: a single Again collapses it regardless (verified by tests).
- **Mistakes demote.** Again on a Review card moves it to Relearning (counted as learning, and the verse stops being memorized/mastered), stability collapses, difficulty rises; after recovering it returns as young, not mature. Hard is still a successful recall and does not demote.

## Future backup / sync: fields to export

A complete backup is every row of these tables plus two version numbers:

- `decks`: id, title, description, bible_language, translation_code, created_at, updated_at
- `cards`: id, reference, verse_text, note, created_at, updated_at
- `deck_cards`: deck_id, card_id, added_at
- `card_schedule`: card_id, kind, due, stability, difficulty, state, reps, lapses, learning_steps, scheduled_days, last_review, scheduler_version
- `review_logs`: id, card_id, kind, reviewed_at, rating, study_mode, state_before, due_before, stability, difficulty, scheduled_days, elapsed_days
- `settings`: key, value (theme, new_cards_per_day, blank_difficulty, card_kinds)
- Schema version (`PRAGMA user_version`) and `scheduler_version` per card.

Ids are UUIDs and nothing assumes sequential integers, so exports can be merged later.

## Bible text and licensing

The app ships no Bible text. The Bible Gateway helper only opens a search URL built from a parsed reference (known book name + digits). A live passage-import API (Midvash) was evaluated and **rejected** for the MVP: RVR1960 is unavailable, unknown versions are silently substituted, and per-translation licensing would need its own allowlist.

## Before Android packaging (Phase 7 checklist)

1. Add Capacitor + Android; write the native `Database` adapter; verify `PRAGMA foreign_keys`, transactions, and multi-statement migrations on a device.
2. Load the wa-sqlite adapter only in the browser (dynamic import) so the native build doesn't carry the 1.1 MB wasm.
3. External links: `@capacitor/browser` opens an in-app browser view; we want the default browser. Test `@capacitor/app-launcher` (or equivalent) with https links on a real device.
4. Android hardware Back button with HashRouter.
5. Status bar / theme color matching, app icon, splash.
6. Safe-area insets are already applied to the bottom bar (`viewport-fit=cover`); verify on a device with gesture navigation.
7. Verify study screens with the on-screen keyboard (type and blanks modes).
8. Not needed for native: a service worker (assets are bundled). A browser-only offline *reopen* would need one.
