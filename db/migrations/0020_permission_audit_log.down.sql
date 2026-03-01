-- ============================================================================
-- Down Migration: Permission Audit Log
-- ============================================================================

DROP INDEX IF EXISTS idx_audit_log_recent;
DROP INDEX IF EXISTS idx_audit_log_workspace_event_created;
DROP INDEX IF EXISTS idx_audit_log_created_at;
DROP INDEX IF EXISTS idx_audit_log_resource;
DROP INDEX IF EXISTS idx_audit_log_subject;
DROP INDEX IF EXISTS idx_audit_log_actor;
DROP INDEX IF EXISTS idx_audit_log_event_type;
DROP INDEX IF EXISTS idx_audit_log_workspace;

DROP FUNCTION IF EXISTS archive_old_audit_logs(TIMESTAMPTZ);

DROP TABLE IF EXISTS permission_audit_log;
