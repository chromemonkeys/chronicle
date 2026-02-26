DROP TABLE IF EXISTS annotations;

ALTER TABLE threads
  DROP COLUMN IF EXISTS anchor_offsets_json,
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS resolved_outcome,
  DROP COLUMN IF EXISTS orphaned_reason,
  DROP COLUMN IF EXISTS updated_at;
