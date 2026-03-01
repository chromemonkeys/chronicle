-- Drop embed cache table
DROP INDEX IF EXISTS idx_embed_cache_provider;
DROP INDEX IF EXISTS idx_embed_cache_expires_at;
DROP INDEX IF EXISTS idx_embed_cache_url;
DROP TABLE IF EXISTS embed_cache;
