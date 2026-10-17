-- Keeping decks, cards and study schedules in step with the signed-in person's account.
--
--   settings.updated_at     : when a setting was last changed, so the latest change wins when two devices disagree
--   account_sync_state      : for everything last agreed with the account, a fingerprint of it and when it was last changed
--                             (item is "deck~ID", "card~ID", "schedule~CARDID~KIND" or "setting~KEY")
--   account_sync_meta       : small facts: which account this device is backing up to, and how far it has read

ALTER TABLE settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE account_sync_state (
  item       TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE account_sync_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
