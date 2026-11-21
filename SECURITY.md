# Security policy

Simple Bible Memory handles Google sign-in, a private backup of each person's decks, and public deck sharing, so security reports are welcome and taken seriously.

## How to report a problem

**Please do not open a public issue for a security problem.** Use one of these instead:

1. On GitHub: **Security tab > Report a vulnerability** (private; only the maintainer sees it).
2. Email **amyruth.rubio@gmail.com** with "Security" in the subject.

Include what you found, the steps to reproduce it, and which version or page it affects. You will get a reply within a few days. Please give a reasonable time to fix the problem before you share it publicly.

## What is in scope

- The app (web, Android, iPhone and iPad) and the website.
- The Firestore rules in `firestore.rules` (for example, reading or changing another person's backup, or publishing a deck as someone else).

## What is not a vulnerability

- The Firebase web configuration values (`VITE_FIREBASE_*`) and the Google Fonts / YouVersion keys that ship inside the app. They identify the project and cannot be hidden in a client app. Protection comes from the Firestore rules and from restrictions set on the keys. If you find a key that has **no** restrictions or can do something it should not, that is worth reporting.
- Findings that need a rooted or jailbroken device, or physical access to an unlocked phone.

## Secrets and contributors

Never commit keys, tokens, keystores or `.env` files. The repository is scanned for secrets on every pull request. If you notice a secret in the history, report it privately as above so it can be rotated.
