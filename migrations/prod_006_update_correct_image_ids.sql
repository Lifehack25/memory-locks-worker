-- Update MediaObjects with correct Cloudflare Image IDs from the API response
-- Images 1-26 will be used, with 1.webp as the profile picture

-- Update image IDs based on filename mapping
UPDATE MediaObjects SET CloudflareImageId = '8b55c748-eb76-42e2-8144-a70cb9e36400' WHERE FileName = '1.webp';  -- Profile picture
UPDATE MediaObjects SET CloudflareImageId = '4a0ee19d-3a97-4961-97d1-3546b8d4ef00' WHERE FileName = '2.webp';
UPDATE MediaObjects SET CloudflareImageId = 'e65e2b82-63ec-4c5d-7bb9-f8e47d17d600' WHERE FileName = '3.webp';
UPDATE MediaObjects SET CloudflareImageId = '91faca82-9527-4e3a-6401-a57e6bc64000' WHERE FileName = '4.webp';
UPDATE MediaObjects SET CloudflareImageId = '528ac22e-c462-4059-abb8-e79748844800' WHERE FileName = '5.webp';
UPDATE MediaObjects SET CloudflareImageId = '2bf112f3-f687-453b-19dc-17e84dcb4300' WHERE FileName = '6.webp';
UPDATE MediaObjects SET CloudflareImageId = '69b2247f-a66b-440a-d102-590a2467e000' WHERE FileName = '7.webp';
UPDATE MediaObjects SET CloudflareImageId = '165dbb34-f666-40db-5da6-e60924290f00' WHERE FileName = '8.webp';
UPDATE MediaObjects SET CloudflareImageId = 'a8210f98-d2c4-46f5-26f3-ba26b5dd3000' WHERE FileName = '10.webp';
UPDATE MediaObjects SET CloudflareImageId = 'a2ca62b7-f1d9-4367-4554-50e0fee7e500' WHERE FileName = '11.webp';
UPDATE MediaObjects SET CloudflareImageId = '6f05ff93-e7b3-4658-73a6-77108bb14000' WHERE FileName = '12.webp';
UPDATE MediaObjects SET CloudflareImageId = '6d8e8046-325a-4e80-9e97-0a804d5b9a00' WHERE FileName = '13.webp';
UPDATE MediaObjects SET CloudflareImageId = 'fef5f393-0144-403a-a022-85baa1343500' WHERE FileName = '14.webp';
UPDATE MediaObjects SET CloudflareImageId = '2b26efc3-a0fc-4f8f-531d-6d6a6887f900' WHERE FileName = '15.webp';
UPDATE MediaObjects SET CloudflareImageId = 'a997c9d4-694b-4136-b7fe-e5b31027c500' WHERE FileName = '16.webp';
UPDATE MediaObjects SET CloudflareImageId = '2aeef45f-37ba-4811-2eed-996cd965d600' WHERE FileName = '17.webp';
UPDATE MediaObjects SET CloudflareImageId = '61219c40-2ee2-424b-857e-56b753547f00' WHERE FileName = '18.webp';
UPDATE MediaObjects SET CloudflareImageId = '9dd058cb-9698-492f-2fb7-884ed1eb7500' WHERE FileName = '19.webp';
UPDATE MediaObjects SET CloudflareImageId = 'e1b1ca38-4b7f-4ab5-e409-cf381552e100' WHERE FileName = '20.webp';
UPDATE MediaObjects SET CloudflareImageId = 'e16471db-3385-49d0-ad4f-e1c3c0272d00' WHERE FileName = '21.webp';
UPDATE MediaObjects SET CloudflareImageId = '59c77e6a-de04-4c6c-84e1-9aede4da8100' WHERE FileName = '22.webp';
UPDATE MediaObjects SET CloudflareImageId = '58871631-458b-4915-ccf0-053b6346a100' WHERE FileName = '23.webp';
UPDATE MediaObjects SET CloudflareImageId = '86ee537d-aef6-488e-afe9-846119153800' WHERE FileName = '26.webp';

-- Note: I notice there's no 9.webp, 24.webp, or 25.webp in the Cloudflare response
-- Let's delete those MediaObjects that don't have corresponding images
DELETE FROM MediaObjects WHERE FileName IN ('9.webp', '24.webp', '25.webp');

-- Update the URLs to match the new Image IDs using custom domain
UPDATE MediaObjects SET Url = 'https://media.memorylocks.com/cdn-cgi/imagedelivery/Fh6D8c3CvE0G8hv20vsbkw/' || CloudflareImageId || '/public' WHERE LockId = 1;