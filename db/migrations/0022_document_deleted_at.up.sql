-- Add soft-delete support to documents
ALTER TABLE documents ADD COLUMN deleted_at TIMESTAMPTZ;

-- Partial index for listing trashed documents efficiently
CREATE INDEX idx_documents_deleted_at ON documents (deleted_at) WHERE deleted_at IS NOT NULL;
