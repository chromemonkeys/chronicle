-- Add share_mode column to documents table
-- Share modes: private, space, invite, link

ALTER TABLE documents ADD COLUMN IF NOT EXISTS share_mode VARCHAR(10) DEFAULT 'space';

-- Add check constraint for valid share modes
ALTER TABLE documents ADD CONSTRAINT check_share_mode 
    CHECK (share_mode IN ('private', 'space', 'invite', 'link'));

-- Create index for share mode lookups
CREATE INDEX IF NOT EXISTS idx_documents_share_mode ON documents(share_mode);

-- Update existing documents to have 'space' as default
UPDATE documents SET share_mode = 'space' WHERE share_mode IS NULL;
