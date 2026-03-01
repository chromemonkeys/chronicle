-- Embed cache table for oEmbed data
CREATE TABLE IF NOT EXISTS embed_cache (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url         TEXT UNIQUE NOT NULL,
    provider    TEXT NOT NULL,
    data        JSONB NOT NULL,
    cached_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for efficient lookups
CREATE INDEX idx_embed_cache_url ON embed_cache(url);
CREATE INDEX idx_embed_cache_expires_at ON embed_cache(expires_at);
CREATE INDEX idx_embed_cache_provider ON embed_cache(provider);
