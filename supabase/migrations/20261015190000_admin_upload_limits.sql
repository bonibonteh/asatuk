-- Keep admin upload limits aligned with the UI: 25 MiB per file.
-- Preserve private/public bucket visibility and existing access policies.
UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
WHERE id = 'learning-resources';

UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
WHERE id = 'gallery-media';

UPDATE storage.buckets
SET file_size_limit = 26214400,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png'
    ]
WHERE id = 'academic-timetables';
