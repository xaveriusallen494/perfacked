-- Friend requests: allow declining (deleting) a friendship row.
-- The base schema only defined SELECT / INSERT / UPDATE policies for friendships,
-- so declining a pending request (a DELETE) would otherwise be blocked by RLS.
-- Run this in your Supabase SQL Editor.

CREATE POLICY "Users can delete friendships they are part of." ON public.friendships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
