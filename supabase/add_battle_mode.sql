-- Battle Mode
-- Run this in your Supabase SQL Editor after schema.sql

-- 1. Battles table (one drinking battle, usually for a single day/session)
CREATE TABLE IF NOT EXISTS public.battles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('active', 'ended')) DEFAULT 'active' NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ended_at TIMESTAMPTZ,
  winner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Battle participants (the players in a battle)
CREATE TABLE IF NOT EXISTS public.battle_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  battle_id UUID REFERENCES public.battles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(battle_id, user_id)
);

-- 3. Link consumptions to a battle.
--    Nullable: a drink logged during a battle still counts toward normal totals,
--    and also contributes to the battle score when battle_id is set.
ALTER TABLE public.consumptions
  ADD COLUMN IF NOT EXISTS battle_id UUID REFERENCES public.battles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS consumptions_battle_id_idx ON public.consumptions(battle_id);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE public.battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_participants ENABLE ROW LEVEL SECURITY;

-- Battles: viewable by everyone, only the creator manages them.
CREATE POLICY "Battles are viewable by everyone." ON public.battles FOR SELECT USING (true);
CREATE POLICY "Users can create battles." ON public.battles FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update battle." ON public.battles FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Creator can delete battle." ON public.battles FOR DELETE USING (auth.uid() = created_by);

-- Battle participants: viewable by everyone. You can add yourself, or the battle
-- creator can add others. Same logic for removal.
CREATE POLICY "Battle participants are viewable by everyone." ON public.battle_participants FOR SELECT USING (true);
CREATE POLICY "Add self or as battle creator." ON public.battle_participants FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() = (SELECT created_by FROM public.battles WHERE id = battle_id)
);
CREATE POLICY "Remove self or as battle creator." ON public.battle_participants FOR DELETE USING (
  auth.uid() = user_id
  OR auth.uid() = (SELECT created_by FROM public.battles WHERE id = battle_id)
);

-- ==========================================
-- REALTIME
-- ==========================================
-- consumptions is already in the supabase_realtime publication (see schema.sql).
ALTER PUBLICATION supabase_realtime ADD TABLE public.battles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_participants;
