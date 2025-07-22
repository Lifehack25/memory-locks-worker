-- Create users table for custom authentication (Production version with lowercase naming)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    phone_number TEXT,
    auth_provider TEXT NOT NULL, -- 'email', 'phone', 'google', 'apple'
    provider_id TEXT, -- Google/Apple user ID
    name TEXT,
    profile_picture_url TEXT,
    email_verified BOOLEAN DEFAULT 0,
    phone_verified BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME
);

-- Create unique index for auth provider combinations
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_provider 
ON users(auth_provider, provider_id) 
WHERE auth_provider = 'google';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_provider 
ON users(auth_provider, provider_id) 
WHERE auth_provider = 'apple';

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Create index for phone lookups
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);