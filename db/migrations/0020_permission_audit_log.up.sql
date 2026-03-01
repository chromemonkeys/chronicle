-- ============================================================================
-- Migration: Permission Audit Log
-- Ticket: #124 - Permission Change Audit Events
-- Description: Unified audit logging for permission grants, revokes, denials, and changes
-- ============================================================================

-- ============================================================================
-- 1. PERMISSION AUDIT LOG TABLE
-- ============================================================================
-- This table stores all permission-related events for security auditing
-- Replaces and extends the permission_denials table with a unified event log

CREATE TABLE IF NOT EXISTS permission_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event classification
    event_type TEXT NOT NULL CHECK (event_type IN (
        'permission_denied',      -- Access was denied
        'permission_granted',     -- Permission was given
        'permission_revoked',     -- Permission was removed
        'role_changed',           -- Role was modified
        'public_link_created',    -- Shareable link created
        'public_link_revoked',    -- Shareable link disabled
        'guest_invited',          -- External user invited
        'guest_removed',          -- External user removed
        'group_permission_added', -- Group granted permission
        'group_permission_removed' -- Group permission revoked
    )),
    
    -- Actor: who performed the action
    actor_id UUID REFERENCES users(id),
    actor_name TEXT NOT NULL,
    actor_email TEXT,
    
    -- Subject: who/what was affected (user, group, or link)
    subject_type TEXT CHECK (subject_type IN ('user', 'group', 'public_link')),
    subject_id TEXT,  -- Can be user_id, group_id, or link token
    subject_name TEXT,  -- Display name (user name, group name, etc.)
    
    -- Resource: what was affected
    resource_type TEXT NOT NULL CHECK (resource_type IN ('workspace', 'space', 'document')),
    resource_id TEXT NOT NULL,
    resource_name TEXT,  -- Display name for the resource
    
    -- Permission details
    role TEXT,  -- The permission level (viewer, commenter, etc.)
    previous_role TEXT,  -- For role changes: what it was before
    
    -- Request context (for denials)
    path TEXT,  -- API path that was accessed
    method TEXT,  -- HTTP method
    
    -- Additional metadata
    reason TEXT,  -- Optional reason for the change
    ip_address INET,  -- IP address of the actor
    user_agent TEXT,  -- User agent string
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Workspace for filtering/retention
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE
);

-- ============================================================================
-- 2. INDEXES FOR QUERY PERFORMANCE
-- ============================================================================

-- Primary query patterns from the UI spec
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON permission_audit_log (workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON permission_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON permission_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_subject ON permission_audit_log (subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON permission_audit_log (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON permission_audit_log (created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace_event_created 
    ON permission_audit_log (workspace_id, event_type, created_at DESC);

-- Note: Partial indexes with NOW() are not supported in PostgreSQL
-- The composite index idx_audit_log_workspace_event_created handles most recent queries

-- ============================================================================
-- 3. MIGRATE EXISTING PERMISSION DENIALS
-- ============================================================================

-- Copy existing permission_denials to the new unified table
INSERT INTO permission_audit_log (
    event_type,
    actor_id,
    actor_name,
    resource_type,
    resource_id,
    resource_name,
    role,
    path,
    method,
    created_at,
    workspace_id
)
SELECT 
    'permission_denied' AS event_type,
    u.id AS actor_id,
    pd.actor_name,
    pd.resource_type,
    pd.resource_id,
    COALESCE(d.title, s.name, pd.resource_id) AS resource_name,
    pd.role,
    pd.path,
    pd.method,
    pd.created_at,
    COALESCE(s.workspace_id, (SELECT workspace_id FROM workspaces LIMIT 1)) AS workspace_id
FROM permission_denials pd
LEFT JOIN users u ON u.display_name = pd.actor_name
LEFT JOIN documents d ON d.id = pd.resource_id AND pd.resource_type = 'document'
LEFT JOIN spaces s ON (s.id = pd.resource_id AND pd.resource_type = 'space') OR (s.id = d.space_id)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. RETENTION POLICY FUNCTION
-- ============================================================================

-- Function to archive old audit log entries
CREATE OR REPLACE FUNCTION archive_old_audit_logs(cutoff_date TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    -- In production, this would move data to cold storage
    -- For now, we just delete old entries
    DELETE FROM permission_audit_log
    WHERE created_at < cutoff_date;
    
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE permission_audit_log IS 'Unified audit log for all permission-related events. Query with filters for the audit log UI.';
COMMENT ON COLUMN permission_audit_log.event_type IS 'Type of permission event being logged';
COMMENT ON COLUMN permission_audit_log.actor_id IS 'User who performed the action (null for system actions)';
COMMENT ON COLUMN permission_audit_log.subject_id IS 'User, group, or link that was affected';
COMMENT ON COLUMN permission_audit_log.previous_role IS 'For role changes, the previous permission level';
