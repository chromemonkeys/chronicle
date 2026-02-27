-- Per-change review states and audit trail for P2-DIFF-003

-- Store review states for individual changes within a proposal/compare
CREATE TABLE IF NOT EXISTS change_review_states (
  id BIGSERIAL PRIMARY KEY,
  change_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  from_ref TEXT NOT NULL,
  to_ref TEXT NOT NULL,
  review_state TEXT NOT NULL CHECK (review_state IN ('pending', 'accepted', 'rejected', 'deferred')) DEFAULT 'pending',
  rejected_rationale TEXT,
  reviewed_by_name TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (proposal_id, change_id, from_ref, to_ref)
);

CREATE INDEX IF NOT EXISTS idx_change_review_proposal ON change_review_states(proposal_id);
CREATE INDEX IF NOT EXISTS idx_change_review_document ON change_review_states(document_id);
CREATE INDEX IF NOT EXISTS idx_change_review_state ON change_review_states(review_state);
CREATE INDEX IF NOT EXISTS idx_change_review_change_id ON change_review_states(change_id);

-- Audit trail for all review actions
CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'change_accepted',
    'change_rejected',
    'change_deferred',
    'change_reopened',
    'thread_resolved',
    'thread_reopened',
    'proposal_approved',
    'proposal_merged'
  )),
  actor_name TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  change_id TEXT,
  thread_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_document ON audit_events(document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_proposal ON audit_events(proposal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_change ON audit_events(change_id) WHERE change_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_events_thread ON audit_events(thread_id) WHERE thread_id IS NOT NULL;

-- Immutability: audit events cannot be modified or deleted
CREATE OR REPLACE FUNCTION audit_events_immutable_guard()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is immutable; % is not allowed', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_block_update ON audit_events;
CREATE TRIGGER trg_audit_events_block_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION audit_events_immutable_guard();

DROP TRIGGER IF EXISTS trg_audit_events_block_delete ON audit_events;
CREATE TRIGGER trg_audit_events_block_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION audit_events_immutable_guard();
