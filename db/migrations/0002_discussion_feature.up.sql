ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS anchor_offsets_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'GENERAL' CHECK (type IN ('GENERAL', 'LEGAL', 'COMMERCIAL', 'TECHNICAL', 'SECURITY', 'QUERY', 'EDITORIAL')),
  ADD COLUMN IF NOT EXISTS resolved_outcome TEXT CHECK (resolved_outcome IN ('ACCEPTED', 'REJECTED', 'DEFERRED')),
  ADD COLUMN IF NOT EXISTS orphaned_reason TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'GENERAL' CHECK (type IN ('GENERAL', 'LEGAL', 'COMMERCIAL', 'TECHNICAL', 'SECURITY', 'QUERY', 'EDITORIAL')),
  mentions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT annotations_thread_fk FOREIGN KEY (proposal_id, thread_id)
    REFERENCES threads (proposal_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_annotations_proposal_thread_created
  ON annotations (proposal_id, thread_id, created_at ASC);
