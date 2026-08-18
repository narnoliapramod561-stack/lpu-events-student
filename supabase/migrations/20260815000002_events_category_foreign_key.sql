-- Migration: Ensure explicit foreign key from events.category_id to categories.id for PostgREST resource embedding
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_category_id_fkey'
  ) THEN
    ALTER TABLE public.events ADD CONSTRAINT events_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
