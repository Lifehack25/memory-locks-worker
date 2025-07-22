-- Remove Auth0UserId column from Locks table in production
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table

-- Step 1: Create new Locks table without Auth0UserId (matching production Entity Framework naming)
CREATE TABLE Locks_new (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    LockName TEXT,
    AlbumTitle TEXT,
    SealDate TEXT,
    NotifiedWhenScanned INTEGER NOT NULL,
    ScanCount INTEGER NOT NULL,
    CreatedAt TEXT NOT NULL,
    user_id INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Step 2: Copy data from old table to new table (excluding Auth0UserId)
INSERT INTO Locks_new (Id, LockName, AlbumTitle, SealDate, NotifiedWhenScanned, ScanCount, CreatedAt, user_id)
SELECT Id, LockName, AlbumTitle, SealDate, NotifiedWhenScanned, ScanCount, CreatedAt, user_id
FROM Locks;

-- Step 3: Drop old table
DROP TABLE Locks;

-- Step 4: Rename new table to original name
ALTER TABLE Locks_new RENAME TO Locks;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_locks_user_id ON Locks(user_id);
CREATE INDEX IF NOT EXISTS idx_locks_createdat ON Locks(CreatedAt);