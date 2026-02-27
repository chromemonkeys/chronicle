-- Up migration: add role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'editor';

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
