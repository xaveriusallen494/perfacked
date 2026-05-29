-- Custom drinks: let users add their own drink_types + upload images
-- Run this in your Supabase SQL Editor.

-- 1. Track who created a drink. NULL = built-in catalog drink, visible to everyone.
ALTER TABLE public.drink_types
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. RLS so authenticated users can manage their OWN custom drinks.
--    (The existing "viewable by everyone" SELECT policy already covers reads.)
DROP POLICY IF EXISTS "Users can insert their own drink types." ON public.drink_types;
CREATE POLICY "Users can insert their own drink types."
  ON public.drink_types FOR INSERT
  WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update their own drink types." ON public.drink_types;
CREATE POLICY "Users can update their own drink types."
  ON public.drink_types FOR UPDATE
  USING (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can delete their own drink types." ON public.drink_types;
CREATE POLICY "Users can delete their own drink types."
  ON public.drink_types FOR DELETE
  USING (auth.uid() = created_by);

-- ==========================================
-- STORAGE: public bucket for uploaded drink images
-- ==========================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('drink-images', 'drink-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view images (public bucket).
DROP POLICY IF EXISTS "Drink images are publicly readable." ON storage.objects;
CREATE POLICY "Drink images are publicly readable."
  ON storage.objects FOR SELECT
  USING (bucket_id = 'drink-images');

-- Authenticated users can upload into their own folder: drink-images/<user_id>/<file>
DROP POLICY IF EXISTS "Users can upload their own drink images." ON storage.objects;
CREATE POLICY "Users can upload their own drink images."
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'drink-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can replace/delete their own uploads.
DROP POLICY IF EXISTS "Users can update their own drink images." ON storage.objects;
CREATE POLICY "Users can update their own drink images."
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'drink-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own drink images." ON storage.objects;
CREATE POLICY "Users can delete their own drink images."
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'drink-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
