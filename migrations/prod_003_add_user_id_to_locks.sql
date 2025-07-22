-- Add user_id column to existing Locks table (Production version)
-- Keep Auth0UserId for backward compatibility during migration

-- Add the new user_id column
ALTER TABLE Locks ADD COLUMN user_id INTEGER;

-- Create index for the new user_id column
CREATE INDEX IF NOT EXISTS idx_locks_user_id ON Locks(user_id);

-- Note: We keep Auth0UserId column for now to maintain compatibility
-- It can be removed later after migration is complete