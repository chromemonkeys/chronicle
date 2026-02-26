INSERT INTO users (email, display_name)
VALUES
  ('avery@local.chronicle.dev', 'Avery'),
  ('sarah@local.chronicle.dev', 'Sarah R.'),
  ('marcus@local.chronicle.dev', 'Marcus K.'),
  ('jamie@local.chronicle.dev', 'Jamie L.'),
  ('priya@local.chronicle.dev', 'Priya R.')
ON CONFLICT (email) DO NOTHING;

INSERT INTO workspace_memberships (user_id, role)
SELECT id, 'editor' FROM users
ON CONFLICT (user_id) DO NOTHING;
