-- Create mediaobjects table
CREATE TABLE IF NOT EXISTS mediaobjects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lockid INTEGER NOT NULL,
    cloudflareimageid TEXT NOT NULL,
    url TEXT NOT NULL,
    filename TEXT,
    mediatype TEXT NOT NULL,
    isprofilepicture BOOLEAN DEFAULT 0,
    createdat DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lockid) REFERENCES locks(id) ON DELETE CASCADE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_mediaobjects_lockid ON mediaobjects(lockid);
CREATE INDEX IF NOT EXISTS idx_mediaobjects_cloudflareimageid ON mediaobjects(cloudflareimageid);
CREATE INDEX IF NOT EXISTS idx_mediaobjects_createdat ON mediaobjects(createdat);