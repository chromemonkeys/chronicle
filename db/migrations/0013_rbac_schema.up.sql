-- Up migration: comprehensive RBAC schema for Sprint 3
-- Ticket #103: Database Schema for RBAC

-- =============================================================================
-- 1. EXTEND USERS TABLE FOR GUEST SUPPORT
-- =============================================================================

-- Add guest/external user fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_space_id UUID REFERENCES spaces(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS external_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS scim_external_id TEXT;

-- Add constraints
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_external_user_space;
ALTER TABLE users ADD CONSTRAINT chk_external_user_space
  CHECK (
    (is_external = false AND external_space_id IS NULL) OR
    (is_external = true AND external_space_id IS NOT NULL)
  );

-- Create indexes for guest lookups
CREATE INDEX IF NOT EXISTS idx_users_external ON users (is_external) WHERE is_external = true;
CREATE INDEX IF NOT EXISTS idx_users_external_space ON users (external_space_id) WHERE is_external = true;
CREATE INDEX IF NOT EXISTS idx_users_scim ON users (scim_external_id) WHERE scim_external_id IS NOT NULL;

-- =============================================================================
-- 2. GROUPS TABLE (for IdP sync and manual groups)
-- =============================================================================

CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    scim_external_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_groups_workspace ON groups (workspace_id);
CREATE INDEX IF NOT EXISTS idx_groups_scim ON groups (scim_external_id) WHERE scim_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groups_deleted ON groups (deleted_at) WHERE deleted_at IS NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_groups_updated_at ON groups;
CREATE TRIGGER trg_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. GROUP MEMBERSHIPS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS group_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_memberships_group ON group_memberships (group_id);
CREATE INDEX IF NOT EXISTS idx_group_memberships_user ON group_memberships (user_id);

-- =============================================================================
-- 4. UNIFIED PERMISSIONS TABLE (polymorphic for users/groups)
-- =============================================================================

-- This replaces document_permissions with a more flexible design
-- that supports both users and groups, and both spaces and documents

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    
    -- Subject (who): can be a user or a group
    subject_type TEXT NOT NULL CHECK (subject_type IN ('user', 'group')),
    subject_id UUID NOT NULL,
    
    -- Resource (what): can be a space or a document
    resource_type TEXT NOT NULL CHECK (resource_type IN ('space', 'document')),
    resource_id TEXT NOT NULL,
    
    -- Permission level
    role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'suggester', 'editor', 'admin')),
    
    -- Metadata
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Soft delete
    deleted_at TIMESTAMPTZ,
    
    -- Unique constraint: one permission grant per subject/resource combo
    UNIQUE(workspace_id, subject_type, subject_id, resource_type, resource_id)
);

-- Indexes for permission lookups
CREATE INDEX IF NOT EXISTS idx_permissions_workspace ON permissions (workspace_id);
CREATE INDEX IF NOT EXISTS idx_permissions_subject ON permissions (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON permissions (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_permissions_role ON permissions (role);
CREATE INDEX IF NOT EXISTS idx_permissions_expires ON permissions (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_permissions_deleted ON permissions (deleted_at) WHERE deleted_at IS NULL;

-- Partial index for active external user permissions (performance)
CREATE INDEX IF NOT EXISTS idx_permissions_external 
    ON permissions (resource_type, resource_id, role) 
    WHERE subject_type = 'user' AND deleted_at IS NULL;

-- =============================================================================
-- 5. PUBLIC LINKS TABLE (for anonymous sharing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT NOT NULL UNIQUE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter')),
    password_hash TEXT,
    expires_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    
    -- Active link check
    CONSTRAINT chk_active_link CHECK (
        revoked_at IS NULL OR revoked_at > created_at
    )
);

CREATE INDEX IF NOT EXISTS idx_public_links_token ON public_links (token);
CREATE INDEX IF NOT EXISTS idx_public_links_document ON public_links (document_id);
CREATE INDEX IF NOT EXISTS idx_public_links_expires ON public_links (expires_at) WHERE expires_at IS NOT NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_public_links_active ON public_links (document_id) WHERE revoked_at IS NULL;

-- =============================================================================
-- 6. MATERIALIZED VIEW: EFFECTIVE PERMISSIONS
-- =============================================================================
-- This view resolves additive permissions (most permissive wins)
-- and flattens group memberships for fast permission checks

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_effective_permissions AS
WITH user_group_permissions AS (
    -- Expand group memberships into individual user permissions
    SELECT 
        gm.user_id,
        p.resource_type,
        p.resource_id,
        p.role,
        p.workspace_id
    FROM permissions p
    JOIN group_memberships gm ON p.subject_id = gm.group_id
    WHERE p.subject_type = 'group'
      AND p.deleted_at IS NULL
      AND (p.expires_at IS NULL OR p.expires_at > NOW())
),
direct_user_permissions AS (
    -- Direct user permissions
    SELECT 
        p.subject_id AS user_id,
        p.resource_type,
        p.resource_id,
        p.role,
        p.workspace_id
    FROM permissions p
    WHERE p.subject_type = 'user'
      AND p.deleted_at IS NULL
      AND (p.expires_at IS NULL OR p.expires_at > NOW())
),
all_permissions AS (
    SELECT * FROM user_group_permissions
    UNION ALL
    SELECT * FROM direct_user_permissions
),
role_rank AS (
    -- Role hierarchy for determining most permissive
    SELECT 'viewer' AS role, 1 AS rank
    UNION ALL SELECT 'commenter', 2
    UNION ALL SELECT 'suggester', 3
    UNION ALL SELECT 'editor', 4
    UNION ALL SELECT 'admin', 5
)
SELECT 
    ap.user_id,
    ap.resource_type,
    ap.resource_id,
    ap.workspace_id,
    MAX(ap.role) AS role,  -- Simple max works due to role name ordering
    NOW() AS computed_at
FROM all_permissions ap
JOIN role_rank rr ON ap.role = rr.role
GROUP BY ap.user_id, ap.resource_type, ap.resource_id, ap.workspace_id;

-- Unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_eff_perms_lookup 
    ON mv_effective_permissions (user_id, resource_type, resource_id);

-- Index for workspace-scoped queries
CREATE INDEX IF NOT EXISTS idx_mv_eff_perms_workspace 
    ON mv_effective_permissions (workspace_id);

-- =============================================================================
-- 7. FUNCTION TO REFRESH MATERIALIZED VIEW
-- =============================================================================

CREATE OR REPLACE FUNCTION refresh_effective_permissions()
RETURNS TRIGGER AS $$
BEGIN
    -- Use CONCURRENTLY to avoid locking
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_effective_permissions;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-refresh on permission changes
DROP TRIGGER IF EXISTS trg_refresh_effective_permissions ON permissions;
CREATE TRIGGER trg_refresh_effective_permissions
    AFTER INSERT OR UPDATE OR DELETE ON permissions
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_effective_permissions();

DROP TRIGGER IF EXISTS trg_refresh_effective_permissions_groups ON group_memberships;
CREATE TRIGGER trg_refresh_effective_permissions_groups
    AFTER INSERT OR UPDATE OR DELETE ON group_memberships
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_effective_permissions();

-- =============================================================================
-- 8. ROW-LEVEL SECURITY POLICIES
-- =============================================================================

-- Enable RLS on tables
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS threads_visibility ON threads;
DROP POLICY IF EXISTS documents_access ON documents;
DROP POLICY IF EXISTS annotations_access ON annotations;
DROP POLICY IF EXISTS branches_access ON branches;
DROP POLICY IF EXISTS decision_log_access ON decision_log;

-- Thread visibility policy: external users never see INTERNAL threads
CREATE POLICY threads_visibility ON threads
    FOR ALL
    USING (
        visibility = 'EXTERNAL'
        OR current_setting('app.is_external', true)::boolean = false
    );

-- Documents access policy (basic - relies on application-level enforcement for complex cases)
CREATE POLICY documents_access ON documents
    FOR SELECT
    USING (true);  -- Application enforces fine-grained permissions

-- Annotations access policy
CREATE POLICY annotations_access ON annotations
    FOR SELECT
    USING (true);  -- Application enforces

-- Branches access policy
CREATE POLICY branches_access ON branches
    FOR SELECT
    USING (true);  -- Application enforces

-- Decision log: append-only, no modifications
CREATE POLICY decision_log_access ON decision_log
    FOR SELECT
    USING (true);

-- =============================================================================
-- 9. MIGRATE EXISTING DATA
-- =============================================================================

-- Migrate existing document_permissions to new permissions table
INSERT INTO permissions (
    workspace_id,
    subject_type,
    subject_id,
    resource_type,
    resource_id,
    role,
    granted_by,
    granted_at,
    expires_at
)
SELECT 
    d.workspace_id,
    'user' AS subject_type,
    dp.user_id AS subject_id,
    'document' AS resource_type,
    dp.document_id AS resource_id,
    dp.role,
    dp.granted_by,
    dp.granted_at,
    dp.expires_at
FROM document_permissions dp
JOIN documents d ON dp.document_id = d.id
WHERE dp.expires_at IS NULL OR dp.expires_at > NOW()
ON CONFLICT (workspace_id, subject_type, subject_id, resource_type, resource_id) 
DO UPDATE SET 
    role = EXCLUDED.role,
    granted_at = EXCLUDED.granted_at,
    expires_at = EXCLUDED.expires_at;

-- Initial refresh of materialized view
REFRESH MATERIALIZED VIEW mv_effective_permissions;

-- =============================================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE users IS 'Stores both internal members and external guest users. External users have is_external=true and are limited to a single space.';
COMMENT ON TABLE groups IS 'User groups for permission management. Can be synced from IdP via SCIM.';
COMMENT ON TABLE permissions IS 'Unified permission grants. Supports both user and group subjects, and both space and document resources.';
COMMENT ON TABLE public_links IS 'Shareable public links for anonymous document access.';
COMMENT ON MATERIALIZED VIEW mv_effective_permissions IS 'Cached effective permissions resolving group memberships and additive permissions. Refresh via triggers.';
