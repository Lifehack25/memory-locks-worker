-- Drop unused RefreshTokens table - switching to JWT-based refresh tokens
-- This table is no longer needed since we now use self-contained JWT refresh tokens

DROP TABLE IF EXISTS RefreshTokens;
DROP TABLE IF EXISTS refresh_tokens;

-- Drop associated indexes (will be dropped automatically, but explicit for clarity)
DROP INDEX IF EXISTS idx_refresh_tokens_user_id;
DROP INDEX IF EXISTS idx_refresh_tokens_hash;
DROP INDEX IF EXISTS idx_refresh_tokens_expires;
DROP INDEX IF EXISTS idx_refresh_tokens_expired;