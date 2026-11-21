-- Learning resources are intended to be available to all ASA TUK students
-- and public website visitors, regardless of which email they use.
-- Keep staff write permissions in the separate admin/council policies.
DROP POLICY IF EXISTS "Published learning resources are public" ON public.learning_resources;
DROP POLICY IF EXISTS "Learning resources available to students" ON public.learning_resources;
CREATE POLICY "Learning resources available to students"
ON public.learning_resources
FOR SELECT TO anon, authenticated
USING (status <> 'archived');

GRANT SELECT ON TABLE public.learning_resources TO anon, authenticated;

UPDATE storage.buckets
SET public = true
WHERE id = 'learning-resources';
