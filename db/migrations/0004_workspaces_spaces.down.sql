-- Reverse SPEC-003: Workspaces & Spaces

DROP INDEX IF EXISTS idx_documents_space;

ALTER TABLE workspace_memberships DROP COLUMN IF EXISTS workspace_id;

ALTER TABLE documents DROP COLUMN IF EXISTS space_id;

DROP INDEX IF EXISTS idx_spaces_workspace;
DROP TABLE IF EXISTS spaces;
DROP TABLE IF EXISTS workspaces;
