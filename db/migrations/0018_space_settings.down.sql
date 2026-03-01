ALTER TABLE spaces
  DROP COLUMN IF EXISTS default_permission_level,
  DROP COLUMN IF EXISTS default_share_mode,
  DROP COLUMN IF EXISTS icon,
  DROP COLUMN IF EXISTS color,
  DROP COLUMN IF EXISTS archived_at;
