/*
# Public content controls and media

Adds admin-controlled publication flags and image URLs for projects and units.
Creates a public media bucket so authenticated admins can upload local images and
public visitors can view only media URLs explicitly published by an admin.
*/

ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

ALTER TABLE project_units ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE project_units ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "public_select_published_projects" ON projects;
CREATE POLICY "public_select_published_projects" ON projects FOR SELECT
  TO anon USING (is_published = true);

DROP POLICY IF EXISTS "public_select_published_units" ON project_units;
CREATE POLICY "public_select_published_units" ON project_units FOR SELECT
  TO anon USING (is_published = true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('public-media', 'public-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "authenticated_upload_public_media" ON storage.objects;
CREATE POLICY "authenticated_upload_public_media" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'public-media');

DROP POLICY IF EXISTS "authenticated_update_public_media" ON storage.objects;
CREATE POLICY "authenticated_update_public_media" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'public-media') WITH CHECK (bucket_id = 'public-media');

DROP POLICY IF EXISTS "authenticated_delete_public_media" ON storage.objects;
CREATE POLICY "authenticated_delete_public_media" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'public-media');

DROP POLICY IF EXISTS "public_read_public_media" ON storage.objects;
CREATE POLICY "public_read_public_media" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'public-media');
