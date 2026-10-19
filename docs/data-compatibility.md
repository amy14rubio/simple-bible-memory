# Keeping old and new versions of the app compatible

People update the app at different times, and everyone's phone syncs to the same account in Firestore. So at any moment
**different versions of the app are reading and writing the same data**. This page is the rulebook for changing that data
without losing anybody's work.

## Where data lives

| Where                                            | What                                    | Who can be on an old version                            |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------- |
| The phone's own database (`src/data/migrations`) | everything                              | only that phone: it is upgraded when the app is updated |
| `users/{uid}/items` in Firestore (account sync)  | decks, cards, schedules, study settings | **any signed-in device, on any app version**            |
| `publicDecks` in Firestore (Discover)            | published decks and their cards         | **everyone**                                            |

The phone's own database is safe to change freely, as long as you add a migration (the next `000N_*.sql`).
The two Firestore areas are the ones to be careful with.

## The rules

1. **Only add, never rename or remove.** New fields are fine (optional ones, with a default). Do not rename a field, change
   what a value means, or delete a field that an older app still reads.
2. **If an item's shape changes in a way an older app would misread, raise `SCHEMA_VERSION`**
   (`src/domain/account/items.ts`). Every item sent to the account carries `v`. An item saved before versions existed has
   no `v` and counts as 1.
3. **An app leaves items in a newer format completely alone.** It does not read them, does not replace them, does not
   delete them. It remembers that it is holding them back, and after the person updates the app it reads them. This is in
   `accountSync.ts` (the `NEWER` marker) and is tested in `accountSync.test.ts`.
4. **The rules back this up** (`firestore.rules`): an item can never be replaced by one in an older format, even by a later
   edit. That protects newer data even from apps that were released before this rule existed, except that those apps will
   see their saves refused.

## Releasing a change to the synced format

The order matters, because the rules are separate from the app:

1. Change `firestore.rules` first (for example to allow the new field), run `npm run test:rules`, and **deploy the rules**
   (`firebase deploy --only firestore:rules --project simple-bible-memory`). Old apps keep working, because the new rules still
   accept the old shape.
2. Raise `SCHEMA_VERSION` and ship the app.
3. Before each release, install the new build **over an old one that has real data** and check the decks, cards and
   schedules are all still there.

## Published decks (`publicDecks`)

Published decks follow the same idea with their own constant, `PUBLIC_SCHEMA_VERSION` (`src/domain/sharing/version.ts`).
A published deck and each of its cards carry `v`; one published before versions existed counts as 1.

- **Discover** still lists a deck in a newer format, but marks it "Needs a newer app version" and turns Import off with a
  message asking the person to update. Nothing is hidden, and nobody gets a damaged copy.
- **The author's own devices:** an older device that edits a deck a newer device published does not write over it; the deck
  shows a "published by a newer version" status instead.
- **The rules** refuse to replace a card, or set a deck's `v`, in an older format than what is stored.
- **A limit worth knowing:** apps released before this existed update a published deck's details with a partial update (only
  the fields they know), which the rules cannot tell from a correct one. So an old app can still change a newer deck's title,
  description, translation or card count. It cannot rewrite its cards. That is why changes to a published deck should stay
  additive.

When you change the shape of a published deck, raise `PUBLIC_SCHEMA_VERSION`; the app then re-sends each deck's details once,
which stamps the public copy with the new version.

## What this does not cover

- Review history never leaves the device, so it needs only a local migration.
