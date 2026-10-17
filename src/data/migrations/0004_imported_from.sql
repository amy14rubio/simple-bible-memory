-- A deck imported from the public catalogue remembers which public deck it came from, so the app can say
-- "you already have this one". (It stays a normal, independent local deck.)
ALTER TABLE decks ADD COLUMN imported_from TEXT;
CREATE INDEX idx_decks_imported_from ON decks(imported_from);
