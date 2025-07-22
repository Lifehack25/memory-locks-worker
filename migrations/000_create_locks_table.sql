-- Create locks table
CREATE TABLE IF NOT EXISTS locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lockname TEXT,
    albumtitle TEXT,
    sealdate DATETIME,
    notifiedwhenscanned BOOLEAN DEFAULT 0,
    scancount INTEGER DEFAULT 0,
    createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    auth0userid TEXT, -- Keep for migration compatibility
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_locks_user_id ON locks(user_id);
CREATE INDEX IF NOT EXISTS idx_locks_auth0userid ON locks(auth0userid);
CREATE INDEX IF NOT EXISTS idx_locks_createdat ON locks(createdat);