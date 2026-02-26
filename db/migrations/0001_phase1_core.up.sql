CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_external BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS revoked_access_tokens (
  jti TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('Draft', 'In review', 'Ready for approval', 'Approved')),
  updated_by_name TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'MERGED', 'REJECTED')),
  branch_name TEXT NOT NULL,
  target_branch TEXT NOT NULL DEFAULT 'main',
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  merged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_proposals_document ON proposals(document_id);
CREATE INDEX IF NOT EXISTS idx_proposals_active ON proposals(document_id, status);

CREATE TABLE IF NOT EXISTS approvals (
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('security', 'architectureCommittee', 'legal')),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved')) DEFAULT 'Pending',
  approved_by_name TEXT,
  approved_at TIMESTAMPTZ,
  PRIMARY KEY (proposal_id, role)
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  anchor_label TEXT NOT NULL,
  anchor_node_id TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED', 'ORPHANED')) DEFAULT 'OPEN',
  visibility TEXT NOT NULL CHECK (visibility IN ('INTERNAL', 'EXTERNAL')) DEFAULT 'INTERNAL',
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by_name TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT,
  PRIMARY KEY (proposal_id, id)
);

CREATE INDEX IF NOT EXISTS idx_threads_proposal_status ON threads(proposal_id, status);

CREATE TABLE IF NOT EXISTS named_versions (
  id BIGSERIAL PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  version_name TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decision_log (
  id BIGSERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('ACCEPTED', 'REJECTED', 'DEFERRED')),
  rationale TEXT NOT NULL,
  decided_by_name TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  commit_hash TEXT NOT NULL,
  participants JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_decision_log_document ON decision_log(document_id, decided_at DESC);

CREATE OR REPLACE RULE decision_log_no_update AS
  ON UPDATE TO decision_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE decision_log_no_delete AS
  ON DELETE TO decision_log DO INSTEAD NOTHING;
