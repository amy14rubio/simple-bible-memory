-- A card can be in its own Bible translation, which lets one deck mix versions. NULL means "the deck's translation" (what every
-- card had until now), so existing cards are unchanged.
-- For a licensed translation (see src/domain/bible/sources.ts) verse_text holds the text that was fetched to THIS device, or ''
-- until it has been fetched; that text is never exported, backed up or published.
ALTER TABLE cards ADD COLUMN translation_code TEXT;
