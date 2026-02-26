DROP RULE IF EXISTS decision_log_no_update ON decision_log;
DROP RULE IF EXISTS decision_log_no_delete ON decision_log;

DROP TABLE IF EXISTS decision_log;
DROP TABLE IF EXISTS named_versions;
DROP TABLE IF EXISTS threads;
DROP TABLE IF EXISTS approvals;
DROP TABLE IF EXISTS proposals;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS revoked_access_tokens;
DROP TABLE IF EXISTS refresh_sessions;
DROP TABLE IF EXISTS workspace_memberships;
DROP TABLE IF EXISTS users;
