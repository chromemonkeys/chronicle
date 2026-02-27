-- Down migration for document hierarchy

ALTER TABLE documents DROP COLUMN IF EXISTS parent_id;
ALTER TABLE documents DROP COLUMN IF EXISTS sort_order;
ALTER TABLE documents DROP COLUMN IF EXISTS path;
DROP INDEX IF EXISTS idx_documents_parent;
DROP INDEX IF EXISTS idx_documents_path;
