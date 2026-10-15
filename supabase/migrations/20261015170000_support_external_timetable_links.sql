-- Support approved HTTPS timetable URLs as well as private PDF uploads.
-- Keep the private bucket and database upload ceiling aligned at 25 MiB.
ALTER TABLE public.academic_timetables
  ADD COLUMN IF NOT EXISTS file_url text;

ALTER TABLE public.academic_timetables
  ALTER COLUMN file_path DROP NOT NULL;

ALTER TABLE public.academic_timetables
  DROP CONSTRAINT IF EXISTS academic_timetables_file_path_check,
  DROP CONSTRAINT IF EXISTS academic_timetables_file_size_check,
  DROP CONSTRAINT IF EXISTS academic_timetables_file_type_check;

ALTER TABLE public.academic_timetables
  ADD CONSTRAINT academic_timetables_file_path_check
    CHECK (
      file_path IS NULL
      OR file_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,140}$'
    ),
  ADD CONSTRAINT academic_timetables_file_size_check
    CHECK (file_size BETWEEN 0 AND 26214400),
  ADD CONSTRAINT academic_timetables_file_type_check
    CHECK (file_type IN ('application/pdf','image/jpeg','image/png','external/url')),
  ADD CONSTRAINT academic_timetables_file_source_check
    CHECK (
      (file_path IS NOT NULL AND file_url IS NULL AND file_size > 0)
      OR
      (file_path IS NULL AND file_url IS NOT NULL AND file_size = 0 AND file_type = 'external/url')
    ),
  ADD CONSTRAINT academic_timetables_file_url_check
    CHECK (file_url IS NULL OR file_url ~ '^https://');

UPDATE storage.buckets
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png']
WHERE id = 'academic-timetables';
