-- Migration to rename all database columns from snake_case to PascalCase
-- This migration ensures consistent naming convention across the entire database

-- Rename columns in users table
ALTER TABLE users RENAME COLUMN phone_number TO PhoneNumber;
ALTER TABLE users RENAME COLUMN auth_provider TO AuthProvider;
ALTER TABLE users RENAME COLUMN provider_id TO ProviderId;
ALTER TABLE users RENAME COLUMN profile_picture_url TO ProfilePictureUrl;
ALTER TABLE users RENAME COLUMN email_verified TO EmailVerified;
ALTER TABLE users RENAME COLUMN phone_verified TO PhoneVerified;
ALTER TABLE users RENAME COLUMN created_at TO CreatedAt;
ALTER TABLE users RENAME COLUMN updated_at TO UpdatedAt;
ALTER TABLE users RENAME COLUMN last_login_at TO LastLoginAt;

-- Rename columns in locks table
ALTER TABLE locks RENAME COLUMN lockname TO LockName;
ALTER TABLE locks RENAME COLUMN albumtitle TO AlbumTitle;
ALTER TABLE locks RENAME COLUMN sealdate TO SealDate;
ALTER TABLE locks RENAME COLUMN notifiedwhenscanned TO NotifiedWhenScanned;
ALTER TABLE locks RENAME COLUMN scancount TO ScanCount;
ALTER TABLE locks RENAME COLUMN createdat TO CreatedAt;
ALTER TABLE locks RENAME COLUMN user_id TO UserId;

-- Rename columns in mediaobjects table
ALTER TABLE mediaobjects RENAME COLUMN lockid TO LockId;
ALTER TABLE mediaobjects RENAME COLUMN cloudflareimageid TO CloudflareImageId;
ALTER TABLE mediaobjects RENAME COLUMN filename TO FileName;
ALTER TABLE mediaobjects RENAME COLUMN mediatype TO MediaType;
ALTER TABLE mediaobjects RENAME COLUMN isprofilepicture TO IsMainPicture;
ALTER TABLE mediaobjects RENAME COLUMN createdat TO CreatedAt;

-- Drop old indexes and create new ones with updated column names
DROP INDEX IF EXISTS idx_locks_user_id;
DROP INDEX IF EXISTS idx_locks_createdat;
DROP INDEX IF EXISTS idx_users_phone;
DROP INDEX IF EXISTS idx_mediaobjects_lockid;
DROP INDEX IF EXISTS idx_mediaobjects_cloudflareimageid;
DROP INDEX IF EXISTS idx_mediaobjects_createdat;

-- Create new indexes with PascalCase column names
CREATE INDEX IF NOT EXISTS idx_locks_UserId ON locks(UserId);
CREATE INDEX IF NOT EXISTS idx_locks_CreatedAt ON locks(CreatedAt);
CREATE INDEX IF NOT EXISTS idx_users_PhoneNumber ON users(PhoneNumber);
CREATE INDEX IF NOT EXISTS idx_mediaobjects_LockId ON mediaobjects(LockId);
CREATE INDEX IF NOT EXISTS idx_mediaobjects_CloudflareImageId ON mediaobjects(CloudflareImageId);
CREATE INDEX IF NOT EXISTS idx_mediaobjects_CreatedAt ON mediaobjects(CreatedAt);

-- Update the unique provider indexes to use new column names
DROP INDEX IF EXISTS idx_users_google_provider;
DROP INDEX IF EXISTS idx_users_apple_provider;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_provider 
ON users(AuthProvider, ProviderId) 
WHERE AuthProvider = 'google';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_provider 
ON users(AuthProvider, ProviderId) 
WHERE AuthProvider = 'apple';