-- Public visitors must be able to list published learning resources without
-- any lookup against the private admin_users table. Uploaded resource files
-- are intended for public student access after publication.
DROP POLICY IF EXISTS "Published learning resources are public" ON public.learning_resources;
CREATE POLICY "Published learning resources are public"
ON public.learning_resources
FOR SELECT TO anon, authenticated
USING (status = 'published');

GRANT SELECT ON TABLE public.learning_resources TO anon, authenticated;

UPDATE storage.buckets
SET public = true
WHERE id = 'learning-resources';
