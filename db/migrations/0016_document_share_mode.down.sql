-- Remove share_mode column from documents table

DROP INDEX IF EXISTS idx_documents_share_mode;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS check_share_mode;
ALTER TABLE documents DROP COLUMN IF EXISTS share_mode;
