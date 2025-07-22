-- Update locks table to use custom user IDs instead of Auth0
-- First, add the new column
ALTER TABLE locks ADD COLUMN user_id INTEGER;

-- Create index for the new user_id column
CREATE INDEX IF NOT EXISTS idx_locks_user_id ON locks(user_id);

-- Add foreign key constraint (if locks table already exists)
-- Note: SQLite doesn't support adding foreign key constraints to existing tables
-- This would need to be handled in application logic or table recreation

-- Remove auth0userid column if it exists (optional, can be kept for migration)
-- ALTER TABLE locks DROP COLUMN auth0userid; -- Uncomment when ready to drop