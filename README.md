<img src="docs/images/cover.jpg" alt="Simple Bible Memory: a red heart with a cross, on the page of an old Bible" width="100%">

# Simple Bible Memory

This repository holds the source code for Simple Bible Memory: the web app, the Android and iPhone/iPad apps (the same code, wrapped with [Capacitor](https://capacitorjs.com)), the website, and the tests.

## About

Simple Bible Memory is a free app for memorizing Bible verses, built around spaced repetition: you rate how well you remembered a verse, and the app decides when to show it again. It works offline, needs no account, and is available in English and Spanish.

To learn more, see the [website](https://simple-bible-memory.web.app) or the list of features in [docs/features.md](docs/features.md).

## Getting started

- [Website](https://simple-bible-memory.web.app)
- [Google Play](https://play.google.com/store/apps/details?id=app.simplebiblememory)
- [App Store](https://apps.apple.com/us/app/simple-bible-memory/id6827304569)
- [Support on Ko-fi](https://ko-fi.com/simplebiblememory)

## Contributing

Contributions are welcome: bug fixes, translations, accessibility improvements, ideas. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first. To report a security problem, see [SECURITY.md](SECURITY.md); please do not open a public issue for it.

## Developing

You need Node.js 22 or newer (20 works too) and npm.

```bash
git clone https://github.com/amy14rubio/simple-bible-memory.git
cd simple-bible-memory
npm install
npm run dev        # http://localhost:5173
```

The app works right away with no keys. Everything below is optional and needs **your own** account or key (`.env.local` is ignored by git; copy `.env.example` to start):

| What you want | Variable in `.env.local` | Notes |
|---|---|---|
| Passage autofill from YouVersion | `VITE_YOUVERSION_APP_KEY` | Request a key at [developers.youversion.com](https://developers.youversion.com). |
| The full list of 1,400 translations | `node scripts/make-translation-data.mjs` | Needs the key above. Writes two data files that are not in git; without them the picker offers the public-domain texts listed in `src/domain/bible/sources.ts`. |
| Full Google Fonts catalogue | `VITE_GOOGLE_FONTS_API_KEY` | Without it the Font page offers a short hand-picked list. |
| Sharing, Discover and account backup | `VITE_FIREBASE_*` | Create your own Firebase project; see `.env.example`. |
| Try sharing with no Firebase | `VITE_SHARING_BACKEND=fake` | An in-memory stand-in: nothing is saved or sent. |

These keys end up inside the built app, so restrict them in the provider's console.

```bash
npm test                          # unit and repository tests (Vitest)
npx playwright install chromium   # once
npm run test:e2e                  # browser tests, including accessibility checks
npm run test:rules                # Firestore rules (needs Java 21 and the Firebase CLI)
npm run lint
npm run build                     # type-check and production build
```

Pull requests run all of these automatically, plus a scan for leaked secrets.

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). More notes: [features](docs/features.md), [YouVersion and Bible text](docs/youversion.md), [CI/CD](docs/ci-cd.md), [app links](docs/app-links.md), [widgets](docs/widgets.md). The native apps and their release steps are in [docs/android-release.md](docs/android-release.md) and [docs/ios-release.md](docs/ios-release.md); signing keys and Firebase config files for them are not in the repository. If you build your own version, change the app id and use your own accounts (see [BRANDING.md](BRANDING.md)).

## License

The code is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE). In short: you may use, study, change and share it, but if you distribute a modified version, or let people use it over a network, you must publish your source under the same license.

Not covered by that license:

- **The name, logo and store listings.** See [BRANDING.md](BRANDING.md). If you publish a fork, give it a different name and icon.
- **`web-data/ubs-es/`**, the Spanish word-study dictionaries, are under CC BY-SA 4.0 (see the license file in that folder).
- **Bible texts, fonts and other third-party material** keep their own licenses and credits: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The repository contains no licensed Bible text; it is fetched from the YouVersion Platform on the person's device.
