-- Rollback P2-DIFF-003: change review states and audit events

DROP TRIGGER IF EXISTS trg_audit_events_block_update ON audit_events;
DROP TRIGGER IF EXISTS trg_audit_events_block_delete ON audit_events;
DROP FUNCTION IF EXISTS audit_events_immutable_guard();

DROP TABLE IF EXISTS audit_events;
DROP TABLE IF EXISTS change_review_states;
