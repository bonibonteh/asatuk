-- Academic timetable library with a review-before-publication workflow.
-- Apply only to the Supabase project referenced by assets/admin-config.js.
CREATE TABLE IF NOT EXISTS public.academic_timetables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
  programme text NOT NULL CHECK (char_length(btrim(programme)) BETWEEN 2 AND 160),
  year_of_study smallint NOT NULL CHECK (year_of_study BETWEEN 1 AND 6),
  semester text NOT NULL CHECK (semester IN ('Semester 1','Semester 2','Trimester 1','Trimester 2','Trimester 3','Full year')),
  academic_year text NOT NULL CHECK (academic_year ~ '^[0-9]{4}/[0-9]{4}$'),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1200),
  file_path text NOT NULL UNIQUE CHECK (file_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]{1,140}$'),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  file_size bigint NOT NULL CHECK (file_size BETWEEN 1 AND 26214400),
  file_type text NOT NULL CHECK (file_type IN ('application/pdf','image/jpeg','image/png')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS academic_timetables_public_filter_idx
  ON public.academic_timetables (programme, year_of_study, semester, academic_year)
  WHERE status = 'verified';
CREATE INDEX IF NOT EXISTS academic_timetables_review_queue_idx
  ON public.academic_timetables (created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.academic_timetables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Verified timetables are publicly readable" ON public.academic_timetables;
CREATE POLICY "Verified timetables are publicly readable"
  ON public.academic_timetables FOR SELECT TO anon, authenticated
  USING (status = 'verified');

DROP POLICY IF EXISTS "Admins manage all academic timetables" ON public.academic_timetables;
CREATE POLICY "Admins manage all academic timetables"
  ON public.academic_timetables FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('academic-timetables','academic-timetables',false,26214400,
  ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 26214400,
    allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png'];

DROP POLICY IF EXISTS "Admins upload academic timetables" ON storage.objects;
CREATE POLICY "Admins upload academic timetables"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'academic-timetables' AND public.is_admin());

DROP POLICY IF EXISTS "Admins update academic timetables files" ON storage.objects;
CREATE POLICY "Admins update academic timetables files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'academic-timetables' AND public.is_admin())
  WITH CHECK (bucket_id = 'academic-timetables' AND public.is_admin());

DROP POLICY IF EXISTS "Admins delete academic timetables files" ON storage.objects;
CREATE POLICY "Admins delete academic timetables files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'academic-timetables' AND public.is_admin());

DROP POLICY IF EXISTS "Admins read all academic timetable files" ON storage.objects;
CREATE POLICY "Admins read all academic timetable files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'academic-timetables' AND public.is_admin());

DROP POLICY IF EXISTS "Public read verified academic timetable files" ON storage.objects;
CREATE POLICY "Public read verified academic timetable files"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'academic-timetables'
    AND EXISTS (
      SELECT 1 FROM public.academic_timetables t
      WHERE t.file_path = storage.objects.name
        AND t.status = 'verified'
    )
  );

CREATE OR REPLACE FUNCTION public.set_academic_timetable_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS academic_timetables_updated_at ON public.academic_timetables;
CREATE TRIGGER academic_timetables_updated_at
BEFORE UPDATE ON public.academic_timetables
FOR EACH ROW EXECUTE FUNCTION public.set_academic_timetable_updated_at();
