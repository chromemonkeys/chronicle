-- Up migration: document-level permissions for RBAC-102

CREATE TABLE IF NOT EXISTS document_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'suggester', 'editor', 'admin')),
  granted_by UUID NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_perms_document ON document_permissions (document_id);
CREATE INDEX IF NOT EXISTS idx_doc_perms_user ON document_permissions (user_id);
CREATE INDEX IF NOT EXISTS idx_doc_perms_expires ON document_permissions (expires_at) WHERE expires_at IS NOT NULL;
