-- Remove verification_codes table since Twilio Verify handles code management
-- We don't need to store verification codes locally anymore

DROP TABLE IF EXISTS verification_codes;