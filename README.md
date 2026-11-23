<p align="center"><img src="docs/images/cover.jpg" alt="Simple Bible Memory: a red heart with a cross, on the page of an old Bible" width="720"></p>

# Simple Bible Memory

Learn scripture by heart. Simple Bible Memory is a free app for memorizing Bible verses, built around **spaced repetition**: you rate how well you remembered a verse, and the app decides when to show it again. It is available in English and Spanish.

[Website](https://simple-bible-memory.web.app) · [Google Play](https://play.google.com/store/apps/details?id=app.simplebiblememory) · [App Store](https://apps.apple.com/us/app/simple-bible-memory/id6827304569) · [Support on Ko-fi](https://ko-fi.com/simplebiblememory)

<p align="center">
  <img src="docs/app-store-assets/iphone-6.9/1-home.png" alt="The list of collections" width="19%">
  <img src="docs/app-store-assets/iphone-6.9/2-type.png" alt="Typing a verse from memory" width="19%">
  <img src="docs/app-store-assets/iphone-6.9/3-rate.png" alt="Rating how well a verse was remembered, with the time until it comes back" width="19%">
  <img src="docs/app-store-assets/iphone-6.9/4-blanks.png" alt="Filling in the blanks from a bank of words" width="19%">
  <img src="docs/app-store-assets/iphone-6.9/5-stats.png" alt="Statistics: verses memorized and progress by book" width="19%">
</p>

This repository holds the whole project: the web app, the Android and iPhone/iPad apps (the same code, wrapped with [Capacitor](https://capacitorjs.com)), the website, and the tests.

## What it does

- **Four ways to study:** flashcards, typing the verse from memory, fill in the blanks (four levels), and a hands-free mode where the app reads verses aloud and you recite.
- **Spaced repetition** with [FSRS](https://github.com/open-spaced-repetition) (via `ts-fsrs`). Each verse has two cards, *recall* and *identify*, scheduled separately. There is a daily new-card limit, a due queue, review history, and "extra practice" that does not touch your schedule.
- **Offline first, no account needed.** Everything is stored on the device in SQLite. Signing in with Google is optional and adds a private backup that syncs across devices.
- **Add verses quickly:** type a reference and the passage fills in (in more than a thousand translations through the [YouVersion Platform](https://developers.youversion.com)), or paste a whole chapter and split it into one card per verse.
- **Share and discover:** share a collection with one link, or browse and import collections other people published. Publishing does not show your name or email.
- **Interlinear word study:** tap a word to see the Hebrew or Greek behind it, with Spanish definitions for Greek.
- **Make it yours:** custom theme colors, light/dark mode, your own font, text size up to 200%, study reminders, home-screen widgets.
- **Accessible:** every screen is checked with axe in both themes, and the interface works with the keyboard and screen readers.
- Import decks from Anki ("Notes in Plain Text") and export your decks as JSON.

## Tech stack

React 19 · TypeScript (strict) · Vite · Tailwind CSS v4 · React Router · [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) (SQLite in the browser) · ts-fsrs · Firebase (Auth, Firestore, Hosting) · Capacitor 8 · Vitest · Playwright

## Getting started

You need **Node.js 22** or newer (20 works too) and npm.

```bash
git clone https://github.com/amy14rubio/simple-bible-memory.git
cd simple-bible-memory
npm install
cp .env.example .env.local     # optional, see "Optional services" below
npm run dev                    # http://localhost:5173
```

The app works right away with no keys. You can create decks, type your own verses, study, and everything is saved in your browser.

### Optional services

Everything below is optional. Each one needs **your own** account or key; never use someone else's, and never commit them (`.env.local` is ignored by git).

| What you want | Variable in `.env.local` | Notes |
|---|---|---|
| Passage autofill from YouVersion | `VITE_YOUVERSION_APP_KEY` | Request a key at [developers.youversion.com](https://developers.youversion.com). Without it people type or paste their own verses. |
| Full Google Fonts catalogue | `VITE_GOOGLE_FONTS_API_KEY` | Without it the Font page offers a short hand-picked list. See [docs/features.md](docs/features.md). |
| Sharing, Discover and account backup | `VITE_FIREBASE_*` | Create your own Firebase project; see `.env.example`. |
| Try sharing with no Firebase at all | `VITE_SHARING_BACKEND=fake` | An in-memory stand-in: nothing is saved or sent. Good for working on the Discover and sharing screens. |

These keys end up inside the built app, so they cannot be hidden. Restrict them in the provider's console (allowed websites or apps, quotas).

## Tests and checks

```bash
npm test                 # unit and repository tests (Vitest)
npx playwright install chromium   # once
npm run test:e2e         # browser tests (Playwright), including accessibility checks
npm run test:rules       # Firestore security rules (needs Java 21 and the Firebase CLI)
npm run lint
npm run build            # type-check and production build
```

Pull requests run all of these automatically (see [.github/workflows/ci.yml](.github/workflows/ci.yml)), plus a scan for leaked secrets.

## Project layout

```
src/
  app/          providers, shell, routing
  components/   shared UI (and shadcn/ui components, restyled)
  features/     screens: decks, cards, study, settings, discover, sharing, account, wordstudy, ...
  domain/       pure TypeScript with no React or SQL: study logic, scheduling, Bible references
  data/         database interface, adapters, migrations, repositories
  platform/     what differs per platform: YouVersion, notifications, voice, deep links, widgets
  i18n/         English and Spanish messages
public/         the website (landing page, legal pages) and static assets
web-data/       data files served by the website (Spanish word-study dictionaries)
tests/          Playwright browser tests
rules-tests/    Firestore rules tests
android/, ios/  the Capacitor native projects
docs/           architecture, release runbooks, feature notes
```

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). More notes: [features](docs/features.md), [YouVersion and Bible text](docs/youversion.md), [app links](docs/app-links.md), [widgets](docs/widgets.md).

## Android and iPhone/iPad

The native apps are the web app inside Capacitor. `npm run ios:sync` builds the web app and copies it into the iOS project. Signing keys, Firebase config files for the native apps (`google-services.json`, `GoogleService-Info.plist`) and Apple/Google accounts are **not** in the repository; the release steps are in [docs/android-release.md](docs/android-release.md) and [docs/ios-release.md](docs/ios-release.md). If you build your own version, change the app id and use your own Firebase project and developer accounts (see [BRANDING.md](BRANDING.md)).

## Contributing

Contributions are welcome: bug fixes, translations, accessibility improvements, ideas. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first, and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](SECURITY.md); please do not open a public issue for it.

## License

The code is licensed under the **[GNU Affero General Public License v3.0 or later](LICENSE)** (AGPL-3.0-or-later). In short: you may use, study, change and share it, but if you distribute a modified version, or let people use it over a network, you must publish your source under the same license and keep the copyright notices.

Not covered by that license:

- **The name, logo and store listings.** See [BRANDING.md](BRANDING.md). If you publish a fork, give it a different name and icon.
- **`web-data/ubs-es/`**, the Spanish word-study dictionaries, are under CC BY-SA 4.0 (see the license file in that folder).
- **Bible texts, fonts and other third-party material** keep their own licenses and credits: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The repository contains no licensed Bible text; licensed translations are fetched from the YouVersion Platform on the person's device and are not redistributed.

## Credits

Spaced repetition by [FSRS](https://github.com/open-spaced-repetition). Greek and Hebrew word data from [STEPBible](https://www.stepbible.org/) and the [Berean Interlinear Bible](https://bereanbible.com/). Spanish definitions from the United Bible Societies. Bible text and translation list from the [YouVersion Platform](https://developers.youversion.com). Fonts: Literata and Instrument Sans (SIL OFL 1.1). Full list: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
