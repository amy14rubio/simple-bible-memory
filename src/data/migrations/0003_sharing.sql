-- Publishing a deck to the public catalogue, and keeping the published copy in step with the local deck.
--
--   decks.publish_id     : set while the deck is published (the id of its public copy); NULL otherwise
--   decks.synced_meta    : fingerprint of the deck's details as last sent (title, description, translation, ...)
--   deck_cards.synced_hash : fingerprint of a card as last sent, so only cards that changed are sent again
--   sync_tombstones      : deletions the public copy has not heard about yet (card_id '' means the whole deck)

ALTER TABLE decks ADD COLUMN publish_id TEXT;
ALTER TABLE decks ADD COLUMN synced_meta TEXT;
ALTER TABLE deck_cards ADD COLUMN synced_hash TEXT;

CREATE TABLE sync_tombstones (
  publish_id TEXT NOT NULL,
  card_id    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (publish_id, card_id)
);

-- A card leaves a published deck (the card was deleted, or removed from the deck): remember to remove it from the copy.
CREATE TRIGGER sync_card_removed AFTER DELETE ON deck_cards
WHEN (SELECT publish_id FROM decks WHERE id = OLD.deck_id) IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO sync_tombstones (publish_id, card_id)
  VALUES ((SELECT publish_id FROM decks WHERE id = OLD.deck_id), OLD.card_id);
END;

-- A published deck is deleted: remember to remove the whole public copy.
CREATE TRIGGER sync_deck_removed BEFORE DELETE ON decks
WHEN OLD.publish_id IS NOT NULL
BEGIN
  INSERT OR IGNORE INTO sync_tombstones (publish_id, card_id) VALUES (OLD.publish_id, '');
END;
