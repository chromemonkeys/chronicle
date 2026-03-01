-- Magic links table for guest authentication
CREATE TABLE IF NOT EXISTS magic_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash      VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash of the token
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id     TEXT REFERENCES documents(id) ON DELETE CASCADE,
    space_id        TEXT REFERENCES spaces(id) ON DELETE CASCADE,
    expires_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at         TIMESTAMP WITH TIME ZONE,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX idx_magic_links_token_hash ON magic_links(token_hash);
CREATE INDEX idx_magic_links_user_id ON magic_links(user_id);
CREATE INDEX idx_magic_links_document_id ON magic_links(document_id);
CREATE INDEX idx_magic_links_space_id ON magic_links(space_id);
CREATE INDEX idx_magic_links_expires_at ON magic_links(expires_at);

-- Rate limiting table for magic link requests
CREATE TABLE IF NOT EXISTS magic_link_rate_limits (
    email       VARCHAR(255) PRIMARY KEY,
    request_count   INTEGER DEFAULT 1,
    window_start    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_magic_link_rate_limits_window ON magic_link_rate_limits(window_start);

-- Attempt tracking table for brute force protection
CREATE TABLE IF NOT EXISTS magic_link_attempts (
    token_hash      VARCHAR(64) PRIMARY KEY,
    attempt_count   INTEGER DEFAULT 1,
    last_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_magic_link_attempts_last_attempt ON magic_link_attempts(last_attempt_at);
