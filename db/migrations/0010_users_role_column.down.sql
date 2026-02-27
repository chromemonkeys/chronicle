-- Down migration: remove role column from users
ALTER TABLE users DROP COLUMN IF EXISTS role;
