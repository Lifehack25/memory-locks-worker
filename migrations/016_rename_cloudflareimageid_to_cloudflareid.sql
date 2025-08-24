-- Rename CloudflareImageId column to CloudflareId to support both images and videos
ALTER TABLE mediaobjects RENAME COLUMN CloudflareImageId TO CloudflareId;

-- Update index to use new column name
DROP INDEX IF EXISTS idx_mediaobjects_CloudflareImageId;
CREATE INDEX IF NOT EXISTS idx_mediaobjects_CloudflareId ON mediaobjects(CloudflareId);