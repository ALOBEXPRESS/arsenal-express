-- Cria bucket público para efeitos sonoros customizados dos usuários
-- Cada usuário tem sua pasta: sfx-custom/{user_id}/{category}/{timestamp}-{filename}

-- Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('sfx-custom', 'sfx-custom', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sfx-custom' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to read their own files
CREATE POLICY "Users can read own files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'sfx-custom' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'sfx-custom' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access (para preview)
CREATE POLICY "Public can read all files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'sfx-custom');
