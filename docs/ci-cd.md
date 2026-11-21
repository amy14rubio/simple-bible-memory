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
| `.github/workflows/ci.yml` | every pull request, and every push to `main` | four parallel jobs: **checks** (lint, type-check, unit tests, build), **e2e** (Playwright browser tests), **rules** (Firestore security rules in the emulator), **secrets** (gitleaks scans the whole history for keys) |
| `.github/workflows/deploy-web.yml` | only when you press **Run workflow** | builds and deploys the website and web app to Firebase Hosting |
| `.github/dependabot.yml` | monthly | opens a pull request when a GitHub Action we use has a new version |

Store releases (Google Play, App Store) stay manual, see `android-release.md` and `ios-release.md`. Firestore rules are not deployed by the robot either: `firebase deploy --only firestore:rules --project simple-bible-memory` stays a human decision.

## Part 1: turn CI on (nothing to configure)

1. Merge or push this branch. GitHub notices the `.github/workflows` folder by itself.
2. Open a pull request. At the bottom of the page you will see **Checks** with four lines (checks, e2e, rules, secrets), each spinning, then a green tick or a red cross. Click **Details** on any line to read its log; it is the same output you see in your terminal.
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

## Before the first automatic deploy: the landing screenshots

The deploy builds from the repository only. The landing page uses phone screenshots (`public/landing/note/`) that show copyrighted Bible translations; the plan for the open-source release is to remove them from the repository. After that, a deploy made by the robot would publish a landing page with broken images. Pick one before turning on automatic deploys:

1. retake those screenshots with public-domain verses (WEB, RV1909) and commit them; or
2. keep deploying from your Mac until that is done.

## Safety notes

- **Fork pull requests cannot see secrets.** That is a GitHub default and what we rely on. The deploy workflow only runs from `main` or the Run button; it is never triggered by a pull request.
- Do not use the `pull_request_target` trigger with a checkout of the pull request's code. It gives a stranger's code your secrets.
- The service-account key does not expire. Rotate it (create a new key, update the secret, delete the old key) if you ever think it leaked, and once a year anyway. A keyless setup called Workload Identity Federation exists and is a good next step when you are comfortable with this one.
- Each action is pinned to an exact version. Dependabot proposes updates; read the pull request like any other.
