-- Down migration: remove suggester role and permission_denials table

DROP TABLE IF EXISTS permission_denials;

-- Restore original CHECK constraint without 'suggester'
ALTER TABLE workspace_memberships DROP CONSTRAINT IF EXISTS workspace_memberships_role_check;
ALTER TABLE workspace_memberships ADD CONSTRAINT workspace_memberships_role_check
  CHECK (role IN ('viewer', 'commenter', 'editor', 'admin'));
