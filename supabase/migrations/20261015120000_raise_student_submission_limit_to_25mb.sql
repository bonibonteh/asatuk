-- Keep the student submission metadata constraint aligned with the existing
-- student-submissions Storage bucket (25 MiB). The bucket already enforces
-- its own 25 MiB limit; this removes the conflicting 5 MiB database ceiling.
ALTER TABLE public.student_submissions
  DROP CONSTRAINT IF EXISTS student_submissions_attachment_size_check;

ALTER TABLE public.student_submissions
  ADD CONSTRAINT student_submissions_attachment_size_check
  CHECK (
    attachment_size IS NULL
    OR attachment_size BETWEEN 1 AND 26214400
  );
