-- Fix DisplayOrder for existing MediaObjects with proper gap-based numbering
-- All current records have DisplayOrder = 10, need to assign proper values

-- Update DisplayOrder based on CreatedAt within each LockId group
-- Using gap-based numbering: 10, 20, 30, 40, etc.

UPDATE MediaObjects 
SET DisplayOrder = (
    SELECT (ROW_NUMBER() OVER (
        PARTITION BY LockId 
        ORDER BY CreatedAt ASC, id ASC
    )) * 10
    FROM (
        SELECT id, LockId, CreatedAt 
        FROM MediaObjects 
        WHERE MediaObjects.id = outer_mo.id
    ) AS ranked_mo
)
FROM MediaObjects AS outer_mo
WHERE MediaObjects.id = outer_mo.id;

-- Create index for better performance on DisplayOrder queries
CREATE INDEX IF NOT EXISTS idx_mediaobjects_lockid_displayorder 
ON MediaObjects(LockId, DisplayOrder);

-- Verify the update worked correctly
-- This will show the distribution of DisplayOrder values per lock
SELECT 
    LockId,
    COUNT(*) as MediaCount,
    MIN(DisplayOrder) as MinDisplayOrder,
    MAX(DisplayOrder) as MaxDisplayOrder,
    GROUP_CONCAT(DisplayOrder ORDER BY DisplayOrder) as DisplayOrders
FROM MediaObjects 
GROUP BY LockId 
ORDER BY LockId;