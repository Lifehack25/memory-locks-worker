-- Add missing MediaObjects for images 27, 28, 29 that exist in Cloudflare Images
-- Total MediaObjects will be 26 (images 9, 24, 25 don't exist in Cloudflare Images)

INSERT INTO mediaobjects (lockid, cloudflareimageid, url, filename, mediatype, isprofilepicture, createdat) VALUES
(1, 'f1442122-4fac-4743-686e-04f1ba34f000', 'https://media.memorylocks.com/f1442122-4fac-4743-686e-04f1ba34f000/public', '27.webp', 'image/webp', 0, '2024-01-01 10:26:00'),
(1, '7c462d9b-a75e-4792-0a33-1f3402860e00', 'https://media.memorylocks.com/7c462d9b-a75e-4792-0a33-1f3402860e00/public', '28.webp', 'image/webp', 0, '2024-01-01 10:27:00'),
(1, 'd4479ca8-e933-4e7a-70bd-63ad1b2b5b00', 'https://media.memorylocks.com/d4479ca8-e933-4e7a-70bd-63ad1b2b5b00/public', '29.webp', 'image/webp', 0, '2024-01-01 10:28:00');