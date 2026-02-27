-- Document hierarchical tree structure
-- Supports nested documents within spaces

-- Parent reference for tree structure
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES documents(id) ON DELETE CASCADE;

-- Sort order within parent (for manual reordering)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Materialized path for efficient tree queries (e.g., "/doc1/doc2/doc3")
ALTER TABLE documents ADD COLUMN IF NOT EXISTS path TEXT NOT NULL DEFAULT '';

-- Indexes for tree operations
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);
CREATE INDEX IF NOT EXISTS idx_documents_space_sort ON documents(space_id, parent_id, sort_order);

-- Update path for existing documents (root level documents in their space)
UPDATE documents SET path = '/' || id WHERE parent_id IS NULL AND path = '';
