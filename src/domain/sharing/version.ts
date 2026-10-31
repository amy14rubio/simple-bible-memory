/**
 * The version of the format a published deck is saved in (its details and its cards in `publicDecks`). Every published deck
 * carries it as `v`; one saved before there was a `v` counts as 1.
 * RAISE IT when the shape of a published deck changes in a way an older app would misread (see docs/data-compatibility.md).
 * An older app still lists such a deck, but will not import it (it asks the person to update), and an older app that
 * published it will not overwrite it.
 */
export const PUBLIC_SCHEMA_VERSION = 2;
// 2: a card can carry its own `translation`, and a card in a licensed translation is published WITHOUT its text (`verseText` empty):
//    whoever imports the deck fetches the text again from the publisher. A deck's `translation` can then be a licensed code, or
//    "MIXED" when its cards are in several; its `language` can be any language code.
