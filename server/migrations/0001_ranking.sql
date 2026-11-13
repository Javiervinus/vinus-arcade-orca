-- The players who joined the ranking, by the hash of the secret their plugin keeps.
CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  renamed_at INTEGER NOT NULL,
  last_run_at INTEGER NOT NULL DEFAULT 0
);

-- Runs being flown again. A row lives only while its replay goes on, a few requests at most.
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  game TEXT NOT NULL,
  record TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX runs_by_player ON runs (player_id, created_at);
CREATE INDEX runs_by_age ON runs (created_at);

-- Each player's best score in each game, of all time ('all') and of each week ('2026-W46').
CREATE TABLE scores (
  game TEXT NOT NULL,
  period TEXT NOT NULL,
  player_id TEXT NOT NULL,
  score INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (game, period, player_id)
);
CREATE INDEX scores_by_rank ON scores (game, period, score DESC, at ASC);
