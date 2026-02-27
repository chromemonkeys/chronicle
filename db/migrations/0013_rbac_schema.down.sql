-- Down migration: rollback RBAC schema changes

-- Drop triggers first
DROP TRIGGER IF EXISTS trg_refresh_effective_permissions ON permissions;
DROP TRIGGER IF EXISTS trg_refresh_effective_permissions_groups ON group_memberships;

-- Drop functions
DROP FUNCTION IF EXISTS refresh_effective_permissions();

-- Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_effective_permissions;

-- Drop RLS policies (will be recreated by earlier migrations)
DROP POLICY IF EXISTS threads_visibility ON threads;
DROP POLICY IF EXISTS documents_access ON documents;

-- Drop tables (in reverse order of creation)
DROP TABLE IF EXISTS public_links;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS group_memberships;
DROP TABLE IF EXISTS groups;

-- Remove guest columns from users
ALTER TABLE users DROP COLUMN IF EXISTS is_external;
ALTER TABLE users DROP COLUMN IF EXISTS external_space_id;
ALTER TABLE users DROP COLUMN IF EXISTS external_expires_at;
ALTER TABLE users DROP COLUMN IF EXISTS scim_external_id;

-- Note: document_permissions table is kept as it may have existing data
-- from migration 0012
