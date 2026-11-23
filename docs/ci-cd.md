# CI/CD: automatic checks and deploys

A guide for the maintainer. It explains the ideas first, then every click.

## The ideas

- **CI (continuous integration)** is a robot that runs your checks (lint, types, tests) on a clean machine every time someone opens or updates a pull request. It is `npm test` that nobody can forget to run. If it fails, the pull request shows a red cross and should not be merged.
- **CD (continuous deployment)** is a robot that publishes the result: build the site, run `firebase deploy`. It is the same command you type on your Mac, run on a GitHub machine instead.
- **GitHub Actions** is the service that runs both. The recipes are YAML files in `.github/workflows/`. A *workflow* has *jobs*; a job runs *steps* on a fresh Linux machine (a "runner"). Nothing from your Mac is on that machine: only what is in the repository, plus the secrets you give it.

A fresh machine every time is the point: if CI is green, the project works from a clean clone, not just on your computer.

## What is in this repository

| File | When it runs | What it does |
|---|---|---|
| `.github/workflows/ci.yml` | every pull request, and every push to `main` | parallel jobs: **checks** (lint, type-check, unit tests, build), **e2e** (the Playwright browser tests, split over four machines, "shards", so the 40-minute suite takes about 10; pull requests only), **rules** (Firestore security rules in the emulator), **secrets** (gitleaks scans the whole history for keys). A fifth tiny job, **Browser tests (Playwright)**, waits for the four shards and is the single check to require |
| `.github/workflows/deploy-web.yml` | only when you press **Run workflow** | builds and deploys the website and web app to Firebase Hosting |
| `.github/dependabot.yml` | monthly | opens a pull request when a GitHub Action we use has a new version |

Store releases (Google Play, App Store) stay manual, see `android-release.md` and `ios-release.md`. Firestore rules are not deployed by the robot either: `firebase deploy --only firestore:rules --project simple-bible-memory` stays a human decision.

## Part 1: turn CI on (nothing to configure)

1. Merge or push this branch. GitHub notices the `.github/workflows` folder by itself.
2. Open a pull request. At the bottom of the page you will see **Checks** with a few lines (checks, four browser-test shards, rules, secrets), each spinning, then a green tick or a red cross. Click **Details** on any line to read its log; it is the same output you see in your terminal.
3. To rerun a failed job: **Actions** tab, pick the run, **Re-run failed jobs**.

If a red cross is only a flaky browser test, `e2e` already retries once and marks such a test "flaky" instead of failing.

### Make CI mandatory (Settings, five minutes, once)

1. **Settings > Branches > Add branch ruleset** (or "Add classic branch protection rule") for `main`:
   - **Require a pull request before merging**.
   - **Require status checks to pass** and add `Lint, types, unit tests, build`, `Browser tests (Playwright)`, `Firestore security rules` and `Scan for leaked secrets`. (The names appear in the search box only after CI has run once.)
   - **Block force pushes**.
2. **Settings > Code security**: turn on **Secret scanning** and **Push protection** (GitHub refuses a push that contains a known key format) and **Private vulnerability reporting** (the button `SECURITY.md` points people to). Turn on **Dependabot alerts** too.
3. **Settings > Actions > General > Workflow permissions**: leave on "Read repository contents". The workflows ask for only what they need.
4. **Settings > Actions > General > Fork pull request workflows**: keep "Require approval for first-time contributors", so a stranger's pull request does not run until you look at it.

## Part 2: set up deployment to Firebase Hosting

The deploy workflow needs permission to publish to your Firebase project, without your personal Google login. That permission is a **service account**: a robot user with a key file. The key goes into GitHub as a **secret**, which the workflow can read and humans cannot (not even you; GitHub only lets you replace it).

### Step 1. Create the robot user

1. Open the Google Cloud Console, project **simple-bible-memory**: **IAM & Admin > Service Accounts > Create service account**.
2. Name it `github-deploy`. Click **Create and continue**.
3. Give it these roles: **Firebase Hosting Admin** and **Service Usage Consumer**. Click **Done**.
   - If the first deploy fails with `Permission ... denied`, the message names the missing permission; add the role that contains it. That is normal the first time.

### Step 2. Make its key

1. Click `github-deploy` in the list > **Keys > Add key > Create new key > JSON**. A `.json` file downloads.
2. Open it in a text editor and copy **all** of it.
3. In GitHub: **Settings > Secrets and variables > Actions > New repository secret**. Name: `FIREBASE_SERVICE_ACCOUNT`. Paste the JSON. Save.
4. **Delete the downloaded file** from your Mac (and the Trash). It is a password; it should exist in one place only.

### Step 3. Give the build its settings

The app bakes some values in at build time (`VITE_*`). On your Mac they come from `.env.local`, which is not in the repository, so the robot needs them too. Same page, **Secrets and variables > Actions**:

- **Variables** tab (not secret, they ship in the app anyway): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`. Copy the values from your `.env.local`.
- **Secrets** tab: `VITE_GOOGLE_FONTS_API_KEY` and `VITE_YOUVERSION_APP_KEY`. These are not secret from the world once the app ships, but keeping them as secrets stops them from being printed in logs or copied by a pull request.

### Step 4. Add a safety latch

1. **Settings > Environments > New environment**, name it `production` (the workflow already says `environment: production`).
2. Tick **Required reviewers** and add yourself. Now every deploy waits for you to press **Approve**, even when started by a robot trigger later.

### Step 5. Run it

1. **Actions > Deploy web > Run workflow > Run**.
2. When the job reaches the approval gate, click **Review deployments > Approve**.
3. Watch the log. It ends with `Deploy complete!` and the Hosting URL, the same text you see locally. Open the site and check it.

### Step 6 (later). Deploy by itself after every merge

When you trust it, change the top of `deploy-web.yml`:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
```

Because `main` is protected by the required checks from Part 1, a pull request cannot be merged while CI is red, so what reaches `main` has already passed. With the `production` environment's required reviewer, each merge then waits for your **Approve** before anything goes live; remove the reviewer if you want it fully automatic.

## The landing photos: deploy the website from your Mac for now

The three phone photos in the "message from the developer" section (`public/landing/note/`) show Bible text under a license, so they are **not in git**. They exist in your working copy (git ignores them) and in your private folder, `~/sbm-private-files/`.

A deploy builds from whatever files are on the machine that runs it. So:

- **`firebase deploy` on your Mac** includes the photos (they are in your working copy). Nothing changes for you.
- **The robot (GitHub Actions) does not have them.** A deploy from there publishes the site *without* the photos, and the landing page shows just the letter, centered. That is a valid look (the page falls back to it by itself), but it would replace the version people see today.

So keep the deploy workflow on the manual button, and keep deploying the website from your Mac, until you decide the letter alone is how you want the page to look. To let the robot deploy the photos, they would have to be stored somewhere private that the workflow can download (for example a GitHub secret holding a zip, or a private Firebase Storage file). That is possible but not set up.

If the photos ever go missing from your working copy, `npm run private:restore` puts them back (see "Private files that are not in git" below).

## Safety notes

- **Fork pull requests cannot see secrets.** That is a GitHub default and what we rely on. The deploy workflow only runs from `main` or the Run button; it is never triggered by a pull request.
- Do not use the `pull_request_target` trigger with a checkout of the pull request's code. It gives a stranger's code your secrets.
- The service-account key does not expire. Rotate it (create a new key, update the secret, delete the old key) if you ever think it leaked, and once a year anyway. A keyless setup called Workload Identity Federation exists and is a good next step when you are comfortable with this one.
- Each action is pinned to an exact version. Dependabot proposes updates; read the pull request like any other.

## Private files that are not in git: deploy from your Mac

Some files the site and app need are not in git, because they are not ours to republish: the three landing-page phone photos (`public/landing/note/`, they show licensed Bible text) and the YouVersion translation list and language names (`src/domain/bible/catalogue.json`, `languageNames.json`). They are baked into the build, so **a deploy made by the robot would publish a site without the photos and an app that offers only the hand-listed translations.** Keep deploying from your Mac, where they are in your working copy.

Where they live: one folder outside the repository, `~/sbm-private-files/` (or the folder in `SBM_PRIVATE_DIR`), with the files at the same paths as in the repo. It is the only copy that matters, so keep it backed up (Time Machine or iCloud).

- **They come back by themselves.** `npm run private:restore` copies back whatever is missing and never overwrites. A git hook (`.githooks/post-checkout` and `post-merge`) runs it after every checkout, pull and rebase, so switching branches or pulling a branch that stops tracking them does not leave you without them.
- **After a fresh clone, turn the hook on once:** `git config core.hooksPath .githooks`, then `npm run private:restore`.
- **When you make new ones** (for example after `node scripts/make-translation-data.mjs`), run `npm run private:save` to copy them into the private folder.
- In a copy without the private folder (a contributor's), all of this does nothing.

### Could the robot deploy them too?

Yes, and it is the natural next step if you want push-button deploys from GitHub. The private files would live in a small **private** GitHub repository (for example `simple-bible-memory-private`, with the same folder layout), and the deploy workflow would check it out into the right paths before building, using a read-only deploy key stored as a GitHub secret. The same private repository could replace `~/sbm-private-files/` as the source for the restore script. It is not set up yet.
