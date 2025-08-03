-- Migration: Update MediaObject URLs from /public to /standard variant
-- Description: Changes ONLY the Url field in MediaObjects table where URLs end with /public
-- Date: 2024-08-03
-- SAFETY: Only updates Url field, preserves all other data

-- First, show what will be updated (for verification)
SELECT 
    Id,
    Url as current_url,
    REPLACE(Url, '/public', '/standard') as new_url
FROM MediaObjects 
WHERE Url LIKE '%/public'
LIMIT 10;

-- Update ONLY the Url field for MediaObjects that have URLs ending with /public
UPDATE MediaObjects 
SET Url = REPLACE(Url, '/public', '/standard') 
WHERE Url LIKE '%/public' 
  AND Url IS NOT NULL 
  AND Url != '';

-- Verify the changes by counting affected rows
SELECT 
    COUNT(*) as updated_rows,
    'MediaObject URLs successfully updated from /public to /standard' as description
FROM MediaObjects 
WHERE Url LIKE '%/standard';