CREATE TABLE IF NOT EXISTS thread_votes (
  proposal_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, thread_id, user_name),
  CONSTRAINT thread_votes_thread_fk FOREIGN KEY (proposal_id, thread_id)
    REFERENCES threads (proposal_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thread_votes_lookup
  ON thread_votes (proposal_id, thread_id);

CREATE TABLE IF NOT EXISTS thread_reactions (
  proposal_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, thread_id, user_name, emoji),
  CONSTRAINT thread_reactions_thread_fk FOREIGN KEY (proposal_id, thread_id)
    REFERENCES threads (proposal_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thread_reactions_lookup
  ON thread_reactions (proposal_id, thread_id);
