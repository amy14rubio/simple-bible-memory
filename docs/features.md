# Feature notes

How a few of the app's features work behind the scenes. For the code layout see [ARCHITECTURE.md](ARCHITECTURE.md); for Bible text and translations see [youversion.md](youversion.md).

## Fonts and the Google Fonts key (optional)

Settings > Font lets you pick one font for the whole app. Without any setup it offers a short hand-picked list. For the full Google Fonts catalogue (about 1,700 families), add a key:

1. Google Cloud Console: create a project, enable the **Web Fonts Developer API**, and create an **API key**.
2. Restrict the key (it is bundled into the app, so these limits are what protect it): API restriction to *Web Fonts Developer API* only, and HTTP referrer restriction to your site's address plus `http://localhost:*` for development.
3. Copy `.env.example` to `.env.local` (git ignores it) and set `VITE_GOOGLE_FONTS_API_KEY=your key`. Restart `npm run dev`.

The list is kept on the device for a week. If the key is missing or Google can't be reached, the short list is used instead. Only the Latin characters of the chosen font are downloaded, and only that one font is kept on the device.


## Exporting and importing decks

- **Export deck** (deck ⋯ menu) saves one deck as a `.json` file. The "Include my progress" switch also saves your study schedule and history; leave it off when sharing.
- **Settings > Account and backup > Export everything** saves every deck, with progress by default, as a backup.
- **Import** (the + drawer, or Settings) reads a deck file from this app, or an Anki deck exported as "Notes in Plain Text" (you choose which column is the verse, the passage and the source). Imports always become new decks; nothing already in the app is changed.


## Account backup and sync (Google sign-in)

Signing in with Google (Settings > Account and backup) backs up the person's decks, cards, study schedules and the three study settings to a private area of Firestore, and brings them to any device they sign in on. There is nothing to press: it runs in the background, and works offline (changes wait and are sent when the connection is back). Review history, theme, font and language stay on the device. No Cloud Functions are used.

- **Where it lives:** `users/{uid}/items/{kind~id}`, one small document per deck, card (with the decks it is in), schedule and setting. `firestore.rules` makes it private to the person, checks every document's shape, and refuses to replace a newer version with an older one. The rules are tested against the emulator: `npm run test:rules`.
- **How it syncs:** the device remembers a fingerprint of everything it last agreed with the account (`account_sync_state`), sends what differs, and sends a "deleted" stub for what was removed. Each device listens for changes by "synced at" time, so other devices' edits arrive live. When two devices disagree, the most recent edit wins (`updated_at`; for a schedule, the most recent review). See `src/features/account/accountSync.ts`.
- **Signing in on a device that already has decks:** they are merged with the account's. If the device was linked to a different account before, the person is asked whether to add its decks to the new account or replace them (`AccountSwitchDialog`).
- **Deleting the account** removes the backup and the public decks; the decks on the device stay.
- **Tests:** `src/features/account/accountSync.test.ts` runs two devices (two databases) against one fake cloud; `tests/account-sync.spec.ts` covers the screens; `rules-tests/account.rules.test.ts` tries to break the rules.
