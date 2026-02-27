-- Rollback full-text search columns and indexes
DROP INDEX IF EXISTS idx_decision_log_fts;
ALTER TABLE decision_log DROP COLUMN IF EXISTS fts;

DROP INDEX IF EXISTS idx_threads_fts;
ALTER TABLE threads DROP COLUMN IF EXISTS fts;

DROP INDEX IF EXISTS idx_documents_fts;
ALTER TABLE documents DROP COLUMN IF EXISTS fts;
