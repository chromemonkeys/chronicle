-- Full-text search support: tsvector columns + GIN indexes
-- Documents: search on title (weight A) and subtitle (weight B)
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(subtitle, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_fts ON documents USING GIN (fts);

-- Threads: search on body (weight A) and anchor_label (weight B)
ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(body, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(anchor_label, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_threads_fts ON threads USING GIN (fts);

-- Decision log: search on rationale (weight A)
ALTER TABLE decision_log
  ADD COLUMN IF NOT EXISTS fts tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(rationale, '')), 'A')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_decision_log_fts ON decision_log USING GIN (fts);
