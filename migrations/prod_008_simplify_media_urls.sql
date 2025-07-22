-- Simplify MediaObjects URLs to work with Cloudflare rewrite rule
-- "Rewrite media.memorylocks.com to Cloudflare Images delivery path"
-- This allows us to use clean URLs like https://media.memorylocks.com/{imageId}/public
-- instead of the full https://media.memorylocks.com/cdn-cgi/imagedelivery/Fh6D8c3CvE0G8hv20vsbkw/{imageId}/public

-- Update all URLs to use the simplified format
-- The Cloudflare rewrite rule will handle the transformation to the full path
UPDATE MediaObjects 
SET Url = 'https://media.memorylocks.com/' || CloudflareImageId || '/public'
WHERE CloudflareImageId IS NOT NULL 
  AND CloudflareImageId != '';