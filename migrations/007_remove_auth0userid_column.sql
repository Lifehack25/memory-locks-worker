-- Remove auth0userid column from locks table as we've fully migrated to custom auth
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Step 1: Create new locks table without auth0userid
CREATE TABLE locks_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lockname TEXT,
    albumtitle TEXT,
    sealdate DATETIME,
    notifiedwhenscanned BOOLEAN DEFAULT 0,
    scancount INTEGER DEFAULT 0,
    createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Step 2: Copy data from old table to new table
INSERT INTO locks_new (id, lockname, albumtitle, sealdate, notifiedwhenscanned, scancount, createdat, user_id)
SELECT id, lockname, albumtitle, sealdate, notifiedwhenscanned, scancount, createdat, user_id
FROM locks;

-- Step 3: Drop old table
DROP TABLE locks;

-- Step 4: Rename new table to original name
ALTER TABLE locks_new RENAME TO locks;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_locks_user_id ON locks(user_id);
CREATE INDEX IF NOT EXISTS idx_locks_createdat ON locks(createdat);