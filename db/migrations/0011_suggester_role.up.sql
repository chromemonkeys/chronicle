-- Up migration: add suggester role and permission_denials table

-- Drop and recreate CHECK constraint on workspace_memberships to include 'suggester'
ALTER TABLE workspace_memberships DROP CONSTRAINT IF EXISTS workspace_memberships_role_check;
ALTER TABLE workspace_memberships ADD CONSTRAINT workspace_memberships_role_check
  CHECK (role IN ('viewer', 'commenter', 'suggester', 'editor', 'admin'));

-- Create permission_denials table for RBAC audit logging
CREATE TABLE IF NOT EXISTS permission_denials (
  id BIGSERIAL PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  role TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_denials_actor ON permission_denials (actor_id);
CREATE INDEX IF NOT EXISTS idx_permission_denials_created ON permission_denials (created_at);
