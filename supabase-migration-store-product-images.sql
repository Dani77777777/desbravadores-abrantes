-- Migration: allow coordinators to upload store product images.
-- Reuses the public 'imagens' bucket (already used for avatars). Product
-- images live in the products/ folder. SELECT is already public for the whole
-- bucket via the existing "Public Access" policy, so we only add write access.
-- get_my_role() returns the EFFECTIVE role, so helper-coordinators are covered.

DROP POLICY IF EXISTS "Coordinators can upload product images" ON storage.objects;
CREATE POLICY "Coordinators can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'imagens'
  AND (storage.foldername(name))[1] = 'products'
  AND public.get_my_role() = 'coordenador'
);

DROP POLICY IF EXISTS "Coordinators can update product images" ON storage.objects;
CREATE POLICY "Coordinators can update product images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'imagens'
  AND (storage.foldername(name))[1] = 'products'
  AND public.get_my_role() = 'coordenador'
);

DROP POLICY IF EXISTS "Coordinators can delete product images" ON storage.objects;
CREATE POLICY "Coordinators can delete product images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'imagens'
  AND (storage.foldername(name))[1] = 'products'
  AND public.get_my_role() = 'coordenador'
);
