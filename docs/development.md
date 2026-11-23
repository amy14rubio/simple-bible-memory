# Development

How to run, test and extend the app. For how the code is organized, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Run it

You need Node.js 22 or newer (20 works too) and npm.

```bash
npm install
npm run dev        # http://localhost:5173
```

The app works right away with no keys: you can create decks, type your own verses, study, and everything is saved in your browser.

## Check your changes

```bash
npm test                          # unit and repository tests (Vitest)
npx playwright install chromium   # once
npm run test:e2e                  # browser tests, including accessibility checks
npm run test:rules                # Firestore rules (needs Java 21 and the Firebase CLI)
npm run lint
npm run build                     # type-check and production build
```

Pull requests run all of these automatically, plus a scan for leaked secrets (see [ci-cd.md](ci-cd.md)).

## Optional services

Each one needs **your own** account or key. Copy `.env.example` to `.env.local` (git ignores it) and fill in what you want.

| What you want | Variable in `.env.local` | Notes |
|---|---|---|
| Passage autofill from YouVersion | `VITE_YOUVERSION_APP_KEY` | Request a key at [developers.youversion.com](https://developers.youversion.com). |
| The full list of 1,400 translations | `node scripts/make-translation-data.mjs` | Needs the key above. Writes two data files that are not in git; without them the picker offers the public-domain texts in `src/domain/bible/sources.ts`. |
| Full Google Fonts catalogue | `VITE_GOOGLE_FONTS_API_KEY` | Without it the Font page offers a short hand-picked list. |
| Sharing, Discover and account backup | `VITE_FIREBASE_*` | Create your own Firebase project; see `.env.example`. |
| Try sharing with no Firebase | `VITE_SHARING_BACKEND=fake` | An in-memory stand-in: nothing is saved or sent. |

These keys end up inside the built app, so restrict them in the provider's console.

## Android and iPhone/iPad

The native apps are the web app inside [Capacitor](https://capacitorjs.com). Signing keys and Firebase config files for them are not in the repository. The maintainer's release steps are not part of this repository. If you build your own version, change the app id and use your own accounts (see [../BRANDING.md](../BRANDING.md)).

## More notes

[Features](features.md) · [YouVersion and Bible text](youversion.md) · [CI/CD](ci-cd.md) · [App links](app-links.md) · [Widgets](widgets.md)
