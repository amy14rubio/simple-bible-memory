# Bible translations from YouVersion

The app can fill in a passage by itself (card form, **Autofill**) from the YouVersion Platform (https://developers.youversion.com),
in translations the app has licenses for. Work in progress on the branch `youversion-translations`.

## Two kinds of text

**Every translation the platform offers this app can be filled in** (about 1,410, in about 1,220 languages). The list is part of the app
(`src/domain/bible/catalogue.json`, with the language names in `languageNames.json`; refresh both with
`node scripts/make-translation-data.mjs`). **Neither file is in git** (they come from the platform's API and its terms about republishing them are unconfirmed): a copy without them lists only the hand-written texts and uses the phone's own language names, and the tests that check the full list skip themselves. They stay on the maintainer's machine, so build and deploy the app from there: **the platform allows this app a fixed number of requests an hour IN ALL, whoever makes them** (it was about 200 while in testing; since the app went live with YouVersion in November 2026 it is **10,000 an hour**), so
no device asks for the list. What is asked for: each verse's text once (then kept on the device), and a translation's copyright notice once. Only a few public-domain ones are *open* (listed by hand in `src/domain/bible/sources.ts`
and `OPEN_TRANSLATIONS`: WEB, BSB, ASV, Geneva, CPDV, World Messianic Bible, Reina-Valera 1909). **Everything else is licensed** by
default, so a translation added to the platform later is safe from day one. **Not offered:** Biblica's versions (69, in many
languages: the NIV family, La Bible du Semeur, the NVI...) and The Passion Translation; their agreements are not used.

| | open | licensed (everything else) |
|---|---|---|
| saved with the card on the device | yes | yes, **fetched** to the device |
| editable | yes | **no** (the agreements: no alterations) |
| backed up in the account (Firestore) | with its text | **reference and translation only** |
| deck file (export) | with its text | **reference and translation only** |
| public decks (Discover) | with its text | **reference and translation only** (format 2; the importer's device fetches the text) |
| publisher's notice and link | no | **always shown** with the text |

The table of translations, their YouVersion ids and notices is `src/domain/bible/sources.ts`. A card stores `translation_code`: the
abbreviation for a hand-listed text (NASB2020), `YV<id>` for any other (YV2692). A licensed text's publisher notice comes from the
platform (`GET /v1/bibles/{id}`: its copyright text, and its link, or the version's bible.com page) and is kept on the device.
The rules that matter come from the agreements (the owner's Google Drive): Lockman (free, no ads, notice + link to lockman.org,
annual report by the end of February) and the lighter MissionAssist/others template (no edits, digital display only, footnotes,
30 days' notice). **The limit was raised to 10,000 an hour when the app went live (it was 200 while testing).** **The same conservative handling is applied to every licensed version**, whatever its publisher: for versions whose
agreement was not read, check it in the Platform portal.

## How it works

- `src/platform/youversion.ts`: GET `https://api.youversion.com/v1/bibles/{id}/passages/{USFM}` with the key in `X-YVP-App-Key`
  (`VITE_YOUVERSION_APP_KEY` in `.env.local`, never committed). The default answer is plain text without verse numbers.
  CORS is open. `src/domain/bible/usfm.ts` turns "Philippians 4:6-7" (English or Spanish names) into USFM pieces; a stretch across
  chapters asks for the first chapter's length once.
- The language tab lists every language that has a translation (names from the phone, `Intl.DisplayNames`); references are typed with
  English or Spanish book names whatever the translation's language (`parseReference` knows those two).
- Cards have their own `translation_code` (migration 0006; null = the deck's). A licensed card is saved with `verse_text = ''` until
  its text has been fetched; `src/features/bible/useLicensedText.ts` fills it in the background (on opening, when the connection
  comes back, when cards change). Cards without text are left out of every study list and count.
- Licensed text is stripped where it could leave the device: the account items (`canonical()` in `src/domain/account/items.ts`),
  deck files (`exchangeRepository`, `format.ts`), and publishing (`blockReason`: a deck with a licensed card is blocked for now).
  `firestore.rules` enforce it for the backup: a card in a licensed translation must have an empty `verseText`
  (the list is checked against `LICENSED_CODES` by a test).

## Before shipping this (in this order, see docs/data-compatibility.md)

1. **Deploy the rules first:** `npm run test:rules`, then `firebase deploy --only firestore:rules --project simple-bible-memory`.
2. `SCHEMA_VERSION` is now 2 (account items): an app that has not been updated leaves items in the new format alone, so people on an
   older version stop syncing until they update.
3. The key is in the app bundle (as the Firebase config is): ask YouVersion whether it can be restricted to this app.
4. Tell Lockman the website addresses (their agreement asks for them); keep the annual report (see below).
5. Update the privacy policy, App Privacy (Apple) and Data safety (Play): YouVersion sees the requests (IP address and the passage asked for).
6. Ask YouVersion: is text-to-speech of a licensed text "digital display" (Speak mode)? Does hiding words (Blanks) count as an edit?
   Is plain text without footnotes fine? Is a donation link on the website OK?

## The off switch (slice 2)

The Firestore document `config/licensedTranslations` (anyone can read it, nobody can write it from the app; **you edit it in the
Firebase console**, Firestore Database, collection `config`) turns licensed translations off without a new app version:

- `off`: an array of codes, for example `["NASB2020", "YV93"]` (the code a card stores: the abbreviation of a hand-listed text, or `YV` and
  the YouVersion id of any other).
- `all`: `true` turns every licensed translation off.

No document, or one the app cannot read, means everything is on. The app reads it when it opens, when the connection comes back and every
half hour. A translation that is off loses its saved text on that device at once (the cards stay, with their references; they leave the
study lists), is no longer offered in the picker or fetched, and gets its text back when it is turned on again. Open texts can never be
switched off. Needs `firebase deploy --only firestore:rules` (the rules for `config`).

## Sharing (slice 3)

A deck with licensed cards can be published and imported. The public copy holds the licensed cards as a reference and a translation, with
**no text**; open cards keep theirs. The deck is labelled with its cards' translation, or `MIXED` (the language is the one the cards share,
or the deck's own), in format 2 (`PUBLIC_SCHEMA_VERSION`; **an app that has not been updated lists such decks as "Needs a newer app
version"**, and every published deck is re-sent once, stamped with the new format). Discover shows a licensed card's reference and the
publisher's tag, with "the text appears once you import the deck"; importing creates the cards, and the device fetches each one's text
(one request per verse, once). The rules (`firestore.rules`) refuse a licensed card with text.

## Still to do

- Split into separate verses for autofilled cards (it needs one request per verse).
- Lockman's annual report: use the usage statistics in the YouVersion Platform portal, and store install counts as a fallback.
- Ask YouVersion to raise the request limit before launching to more than a few people (importing a 30-verse deck is 30 requests).
