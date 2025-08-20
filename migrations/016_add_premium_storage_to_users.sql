-- Add premium storage column to users table
-- This allows users to upgrade from 30 images (free) to 100 images (premium)
ALTER TABLE users ADD COLUMN HasPremiumStorage BOOLEAN DEFAULT 0;

-- Create index for premium storage lookups
CREATE INDEX IF NOT EXISTS idx_users_premium_storage ON users(HasPremiumStorage);