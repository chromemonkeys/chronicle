-- Enforce decision log immutability with hard failures (not silent no-op rules).

DROP RULE IF EXISTS decision_log_no_update ON decision_log;
DROP RULE IF EXISTS decision_log_no_delete ON decision_log;

CREATE OR REPLACE FUNCTION decision_log_immutable_guard()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'decision_log is immutable; % is not allowed', TG_OP
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_decision_log_block_update ON decision_log;
CREATE TRIGGER trg_decision_log_block_update
BEFORE UPDATE ON decision_log
FOR EACH ROW
EXECUTE FUNCTION decision_log_immutable_guard();

DROP TRIGGER IF EXISTS trg_decision_log_block_delete ON decision_log;
CREATE TRIGGER trg_decision_log_block_delete
BEFORE DELETE ON decision_log
FOR EACH ROW
EXECUTE FUNCTION decision_log_immutable_guard();
