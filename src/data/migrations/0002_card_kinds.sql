-- Each verse now has up to two study cards ("kinds"), each with its own FSRS schedule:
--   recall   : you see the verse reference and recall the passage
--   identify : you see the passage and name the verse
-- Existing schedules and reviews belong to 'recall' (the only kind that existed before).

CREATE TABLE card_schedule_v2 (
  card_id           TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('recall', 'identify')),
  due               INTEGER NOT NULL,
  stability         REAL NOT NULL,
  difficulty        REAL NOT NULL,
  state             INTEGER NOT NULL CHECK (state BETWEEN 0 AND 3),
  reps              INTEGER NOT NULL,
  lapses            INTEGER NOT NULL,
  learning_steps    INTEGER NOT NULL,
  scheduled_days    INTEGER NOT NULL,
  last_review       INTEGER,
  scheduler_version TEXT NOT NULL,
  PRIMARY KEY (card_id, kind)
);

INSERT INTO card_schedule_v2
  (card_id, kind, due, stability, difficulty, state, reps, lapses, learning_steps, scheduled_days, last_review, scheduler_version)
SELECT card_id, 'recall', due, stability, difficulty, state, reps, lapses, learning_steps, scheduled_days, last_review, scheduler_version
  FROM card_schedule;

DROP TABLE card_schedule;
ALTER TABLE card_schedule_v2 RENAME TO card_schedule;
CREATE INDEX idx_card_schedule_due ON card_schedule(due);

ALTER TABLE review_logs ADD COLUMN kind TEXT NOT NULL DEFAULT 'recall' CHECK (kind IN ('recall', 'identify'));
CREATE INDEX idx_review_logs_day ON review_logs(reviewed_at);
