ALTER TABLE public.merchandise_products ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.merchandise_products SET image_urls = CASE WHEN image_url IS NOT NULL AND btrim(image_url) <> '' THEN jsonb_build_array(image_url) ELSE '[]'::jsonb END WHERE image_urls = '[]'::jsonb;
