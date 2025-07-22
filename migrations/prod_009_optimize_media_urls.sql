-- Update MediaObjects URLs to use optimized format for rewrite rule
-- Changes from: https://media.memorylocks.com/cdn-cgi/imagedelivery/Fh6D8c3CvE0G8hv20vsbkw/{id}/public
-- To: https://media.memorylocks.com/{id}/public
-- The rewrite rule will automatically add the CDN path

UPDATE mediaobjects 
SET url = 'https://media.memorylocks.com/' || cloudflareimageid || '/public' 
WHERE lockid = 1;