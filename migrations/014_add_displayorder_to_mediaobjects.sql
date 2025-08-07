-- Add DisplayOrder column to mediaobjects table for user-defined image ordering
ALTER TABLE mediaobjects ADD COLUMN DisplayOrder INTEGER;

-- Set initial DisplayOrder values based on CreatedAt for existing records
-- Using gap-based numbering (10, 20, 30...) to allow easy reordering
UPDATE mediaobjects 
SET DisplayOrder = (
    SELECT (ROW_NUMBER() OVER (PARTITION BY LockId ORDER BY CreatedAt) * 10)
    FROM (SELECT id, LockId, CreatedAt FROM mediaobjects mo2 WHERE mo2.id = mediaobjects.id)
);

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_mediaobjects_displayorder ON mediaobjects(LockId, DisplayOrder);