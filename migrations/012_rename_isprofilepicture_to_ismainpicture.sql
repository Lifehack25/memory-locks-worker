-- Migration to rename IsProfilePicture column to IsMainPicture in mediaobjects table
-- This provides clearer semantics for the main/featured image of a lock

-- Rename the column in mediaobjects table
ALTER TABLE mediaobjects RENAME COLUMN IsProfilePicture TO IsMainPicture;