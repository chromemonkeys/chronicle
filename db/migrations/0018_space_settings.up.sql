-- Add settings columns to spaces table
ALTER TABLE spaces
  ADD COLUMN default_permission_level TEXT NOT NULL DEFAULT 'viewer',
  ADD COLUMN default_share_mode TEXT NOT NULL DEFAULT 'space',
  ADD COLUMN icon TEXT NOT NULL DEFAULT '',
  ADD COLUMN color TEXT NOT NULL DEFAULT '',
  ADD COLUMN archived_at TIMESTAMPTZ;
