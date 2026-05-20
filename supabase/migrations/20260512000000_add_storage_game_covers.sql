-- Private bucket for OCR cover-scan uploads. Images are short-lived: mobile
-- uploads → backend OCR via signed URL → image becomes garbage. Cleanup is
-- delegated to a future scheduled job; meanwhile size_limit caps disk usage.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'game-covers',
  'game-covers',
  false,
  3145728, -- 3MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Each user uploads only into their own folder: <user_id>/<filename>
CREATE POLICY "Users can upload their own cover scans"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'game-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read their own cover scans"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'game-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own cover scans"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'game-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
