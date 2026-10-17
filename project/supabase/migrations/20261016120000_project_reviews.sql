CREATE TABLE IF NOT EXISTS public.project_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL CHECK (char_length(trim(reviewer_name)) BETWEEN 1 AND 80),
  verification_type text NOT NULL DEFAULT 'PUBLIC'
    CHECK (verification_type IN ('BUYER', 'OWNER_RESIDENT', 'SITE_VISITOR', 'CLIENT_INTERACTION', 'PUBLIC')),
  verification_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('VERIFIED', 'UNVERIFIED')),
  publication_status text NOT NULL DEFAULT 'PENDING'
    CHECK (publication_status IN ('PENDING', 'PUBLISHED', 'REJECTED')),
  overall_rating integer NOT NULL CHECK (overall_rating BETWEEN 1 AND 5),
  review_text text NOT NULL CHECK (char_length(trim(review_text)) BETWEEN 20 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_reviews_public_project_date_idx
  ON public.project_reviews (project_id, created_at DESC)
  WHERE publication_status = 'PUBLISHED';

ALTER TABLE public.project_reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.project_reviews TO anon, authenticated;
GRANT INSERT, UPDATE ON public.project_reviews TO authenticated;

CREATE POLICY "public_read_published_project_reviews"
  ON public.project_reviews FOR SELECT TO anon, authenticated
  USING (
    publication_status = 'PUBLISHED'
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = project_reviews.project_id
        AND public.projects.is_published = true
    )
  );

CREATE POLICY "clients_submit_pending_project_reviews"
  ON public.project_reviews FOR INSERT TO authenticated
  WITH CHECK (
    reviewer_user_id = auth.uid()
    AND verification_type = 'PUBLIC'
    AND verification_status = 'UNVERIFIED'
    AND publication_status = 'PENDING'
    AND EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = project_reviews.project_id
        AND public.projects.is_published = true
    )
  );

CREATE POLICY "staff_read_all_project_reviews"
  ON public.project_reviews FOR SELECT TO authenticated
  USING (public.is_dashboard_staff());

CREATE POLICY "staff_moderate_project_reviews"
  ON public.project_reviews FOR UPDATE TO authenticated
  USING (public.is_dashboard_staff())
  WITH CHECK (public.is_dashboard_staff());
