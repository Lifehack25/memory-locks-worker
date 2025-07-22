-- Update MediaObjects URLs to use custom domain media.memorylocks.com
-- Replace imagedelivery.net URLs with media.memorylocks.com/cdn-cgi/imagedelivery for consistent branding

-- Update all existing URLs that use imagedelivery.net domain to use the custom domain
UPDATE MediaObjects 
SET Url = REPLACE(Url, 'https://imagedelivery.net/', 'https://media.memorylocks.com/cdn-cgi/imagedelivery/')
WHERE Url LIKE 'https://imagedelivery.net/%';

-- For any URLs that might already be using the account hash directly, update them as well
UPDATE MediaObjects 
SET Url = 'https://media.memorylocks.com/cdn-cgi/imagedelivery/Fh6D8c3CvE0G8hv20vsbkw/' || CloudflareImageId || '/public'
WHERE Url NOT LIKE 'https://media.memorylocks.com/%' 
  AND CloudflareImageId IS NOT NULL 
  AND CloudflareImageId != '';