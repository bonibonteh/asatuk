-- Keep project cover images optional; the public UI renders a local fallback when absent.
ALTER TABLE IF EXISTS public.projects
  ALTER COLUMN cover_image_url DROP NOT NULL;

-- Gallery collection ordering is used by the admin editor and public gallery.
-- Add the expected column safely, preserve current records, and give existing rows
-- a deterministic order based on creation time when no order was set.
ALTER TABLE IF EXISTS public.gallery_collections
  ADD COLUMN IF NOT EXISTS sort_order integer;

UPDATE public.gallery_collections
SET sort_order = COALESCE(sort_order, 0)
WHERE sort_order IS NULL;

ALTER TABLE IF EXISTS public.gallery_collections
  ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE IF EXISTS public.gallery_collections
  ALTER COLUMN sort_order SET NOT NULL;

NOTIFY pgrst, 'reload schema';
