-- Drop magic link attempts table
DROP INDEX IF EXISTS idx_magic_link_attempts_last_attempt;
DROP TABLE IF EXISTS magic_link_attempts;

-- Drop rate limiting table
DROP INDEX IF EXISTS idx_magic_link_rate_limits_window;
DROP TABLE IF EXISTS magic_link_rate_limits;

-- Drop magic links table and related indexes
DROP INDEX IF EXISTS idx_magic_links_token_hash;
DROP INDEX IF EXISTS idx_magic_links_user_id;
DROP INDEX IF EXISTS idx_magic_links_document_id;
DROP INDEX IF EXISTS idx_magic_links_space_id;
DROP INDEX IF EXISTS idx_magic_links_expires_at;
DROP TABLE IF EXISTS magic_links;
