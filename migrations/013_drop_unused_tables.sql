-- Migration to drop unused tables from the database
-- These tables are no longer needed in the current system architecture

-- Drop the EF Migrations History table (no longer using Entity Framework)
DROP TABLE IF EXISTS __EFMigrationsHistory;

-- Drop the refresh_tokens table (now using JWT-based refresh tokens)
DROP TABLE IF EXISTS refresh_tokens;