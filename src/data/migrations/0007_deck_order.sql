-- The order a person has put their decks in on the home screen (0 is the top). NULL means "never ordered by hand": such a deck is
-- listed above the ordered ones, A to Z, so a new deck appears at the top, and a person who has never reordered still sees A to Z.
-- This stays on the device: it is not part of the account backup.
ALTER TABLE decks ADD COLUMN sort_order INTEGER;
