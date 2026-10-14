-- All ids are UUID text. All timestamps are INTEGER UTC epoch milliseconds.

CREATE TABLE decks (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT,
  bible_language   TEXT,            -- e.g. 'en'. NOT the interface language.
  translation_code TEXT,            -- e.g. 'WEB'. Nullable: user-entered text.
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE cards (
  id         TEXT PRIMARY KEY,
  reference  TEXT NOT NULL,         -- 'John 3:16'
  verse_text TEXT NOT NULL,
  note       TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Join table: a card can live in several decks (future shared/reused cards).
CREATE TABLE deck_cards (
  deck_id  TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (deck_id, card_id)
);
CREATE INDEX idx_deck_cards_card ON deck_cards(card_id);

-- Current FSRS state: exactly one row per card. Mirrors ts-fsrs's Card
-- (elapsed_days is deprecated upstream, so it is not stored).
CREATE TABLE card_schedule (
  card_id           TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
  due               INTEGER NOT NULL,
  stability         REAL NOT NULL,
  difficulty        REAL NOT NULL,
  state             INTEGER NOT NULL CHECK (state BETWEEN 0 AND 3), -- 0 New,1 Learning,2 Review,3 Relearning
  reps              INTEGER NOT NULL,
  lapses            INTEGER NOT NULL,
  learning_steps    INTEGER NOT NULL,
  scheduled_days    INTEGER NOT NULL,
  last_review       INTEGER,
  scheduler_version TEXT NOT NULL   -- e.g. 'ts-fsrs@5.4.2/FSRS-6'
);
CREATE INDEX idx_card_schedule_due ON card_schedule(due);

-- Append-only history. Deleted together with the card (decided: cascade).
CREATE TABLE review_logs (
  id             TEXT PRIMARY KEY,
  card_id        TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  reviewed_at    INTEGER NOT NULL,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4), -- 1 Again .. 4 Easy
  study_mode     TEXT NOT NULL CHECK (study_mode IN ('flashcard','type','blanks')),
  state_before   INTEGER NOT NULL,
  due_before     INTEGER NOT NULL,
  stability      REAL NOT NULL,     -- values after this review
  difficulty     REAL NOT NULL,
  scheduled_days INTEGER NOT NULL,
  elapsed_days   INTEGER NOT NULL
);
CREATE INDEX idx_review_logs_card ON review_logs(card_id, reviewed_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL               -- JSON-encoded
);
