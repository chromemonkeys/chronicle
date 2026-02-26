-- SPEC-003: Workspaces & Spaces organizational hierarchy

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spaces (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_spaces_workspace ON spaces(workspace_id);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS space_id TEXT REFERENCES spaces(id);

-- Seed defaults
INSERT INTO workspaces (id, name, slug) VALUES ('ws_default', 'Acme Corp', 'acme-corp') ON CONFLICT DO NOTHING;
INSERT INTO spaces (id, workspace_id, name, slug, description, sort_order)
VALUES ('sp_default', 'ws_default', 'General', 'general', 'Default space for all documents', 0)
ON CONFLICT DO NOTHING;

-- Backfill existing documents
UPDATE documents SET space_id = 'sp_default' WHERE space_id IS NULL;
ALTER TABLE documents ALTER COLUMN space_id SET NOT NULL;

-- Link workspace_memberships to workspace
ALTER TABLE workspace_memberships ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id);
UPDATE workspace_memberships SET workspace_id = 'ws_default' WHERE workspace_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_space ON documents(space_id);
