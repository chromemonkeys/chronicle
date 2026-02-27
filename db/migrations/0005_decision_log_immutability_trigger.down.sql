DROP TRIGGER IF EXISTS trg_decision_log_block_update ON decision_log;
DROP TRIGGER IF EXISTS trg_decision_log_block_delete ON decision_log;
DROP FUNCTION IF EXISTS decision_log_immutable_guard();

-- Restore prior behavior for rollback.
CREATE OR REPLACE RULE decision_log_no_update AS
  ON UPDATE TO decision_log DO INSTEAD NOTHING;

CREATE OR REPLACE RULE decision_log_no_delete AS
  ON DELETE TO decision_log DO INSTEAD NOTHING;
