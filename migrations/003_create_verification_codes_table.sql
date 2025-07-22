-- Create verification_codes table for email/SMS verification
CREATE TABLE IF NOT EXISTS verification_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL, -- email or phone number
    code TEXT NOT NULL, -- 6-digit verification code
    code_type TEXT NOT NULL, -- 'email' or 'sms'
    expires_at DATETIME NOT NULL,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    is_used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER, -- NULL for registration, set for login
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_verification_codes_identifier ON verification_codes(identifier);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- Create index for cleanup of expired codes
CREATE INDEX IF NOT EXISTS idx_verification_codes_cleanup 
ON verification_codes(expires_at, is_used);