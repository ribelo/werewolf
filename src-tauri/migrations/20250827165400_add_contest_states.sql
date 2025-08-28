CREATE TABLE contest_states (
    contest_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'Setup',
    current_lift TEXT,
    current_round INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
);
