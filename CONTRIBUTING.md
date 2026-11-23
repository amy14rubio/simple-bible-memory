# Contributing to Simple Bible Memory

Thank you for wanting to help. This is a small project, so the process is small too.

## Before you start

- **Look for an existing issue**, or open one to describe the bug or idea before you spend time on a big change. A short conversation first saves everyone effort.
- **Small fixes** (typos, a wrong translation, an accessibility bug) can go straight to a pull request.
- Please read the [Code of Conduct](CODE_OF_CONDUCT.md). For security problems use [SECURITY.md](SECURITY.md), not a public issue.

## Set up

```bash
git clone https://github.com/<your-username>/simple-bible-memory.git   # your fork
cd simple-bible-memory
npm install
npm run dev
```

You do not need any keys or accounts to work on most of the app. See "Optional services" in [docs/development.md](docs/development.md) for the YouVersion, Google Fonts and Firebase keys. **Use your own, and never commit them.** To work on sharing or Discover without Firebase, set `VITE_SHARING_BACKEND=fake` in `.env.local`.

## Making a change

1. **One change, one branch.** Create a branch from `main` named for the change (`fix-blank-wrapping`, `add-portuguese`). Never commit directly to `main`.
2. Keep the change focused. Unrelated clean-ups belong in their own pull request.
3. **Add or update tests.** Logic goes in Vitest tests next to the code; screens and flows go in Playwright tests under `tests/`. A bug fix should come with a test that fails without the fix.
4. Run the checks before you push:

   ```bash
   npm run lint
   npm run build        # type-check and production build
   npm test
   npm run test:e2e     # run the files related to your change, at least
   ```

5. Open a pull request against `main`. Say what changed and why, and add a screenshot for anything visual. CI runs the full checks and a secret scan on every pull request; a red cross needs fixing before it can be merged.

## Guidelines

- **TypeScript is strict.** No `any` without a comment saying why.
- **Everything the person reads must be translated.** Add both English and Spanish messages (`src/i18n/`); the app's own text is the only thing that is translated, never verses or deck names.
- **Accessibility is a requirement.** Every screen is checked with axe in light and dark mode. Use real buttons and labels, keep visible focus, respect "reduce motion", and check the screen at 100% and 200% text size.
- **Mobile first.** Check phone widths (360 to 390 px) as well as desktop.
- **Keep it simple.** The app's feeling is calm and minimal. Prefer removing to adding.
- **Bible text and copyright.** Do not add verse text from a licensed translation (NIV, ESV, NLT, Amplified and similar) to the repository, to tests, or to screenshots. Use public-domain text such as the WEB, KJV or Reina-Valera 1909.
- **No secrets, no personal files.** Do not commit keys, tokens, keystores, `.env` files, or your editor/AI-tool settings.

## Licensing of your contribution

The project is licensed under the [AGPL-3.0-or-later](LICENSE). By opening a pull request you confirm that:

1. you wrote the contribution, or have the right to submit it under this license;
2. you license it under the AGPL-3.0-or-later, like the rest of the project; and
3. you also allow the maintainer to distribute it under other terms when needed to publish the official apps, for example in Apple's App Store, whose rules do not fit the AGPL. Your contribution stays available to everyone under the AGPL in this repository.

Sign off your commits (`git commit -s`) to say so; it adds a `Signed-off-by:` line with your name.

If you cannot agree to point 3, say so in the pull request and we will talk about it before merging.

## Translations and Bible data

- New interface languages are welcome. Open an issue first so we can agree on how it is added and who keeps it up to date.
- The Spanish word-study dictionaries in `web-data/ubs-es/` are CC BY-SA 4.0 and must stay that way.

## Questions

Open a [discussion or issue](https://github.com/amy14rubio/simple-bible-memory/issues). There is no wrong question.
