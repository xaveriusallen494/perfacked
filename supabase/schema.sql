-- SipTrack Database Schema
-- Run this in your Supabase SQL Editor

-- 1. Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create Drink Types Table (Catalog of standard drinks)
CREATE TABLE IF NOT EXISTS public.drink_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  volume_ml INTEGER NOT NULL,
  alcohol_percentage DECIMAL(5,2) NOT NULL,
  standard_units DECIMAL(5,2) NOT NULL,
  icon TEXT, -- e.g., 'Beer', 'Wine', 'Martini' (can map to Lucide icons)
  color TEXT, -- e.g., '#F59E0B'
  image_url TEXT, -- e.g., '/drinks/stella-artois.png'
  created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = built-in catalog drink
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create Consumptions Table (The main log)
CREATE TABLE IF NOT EXISTS public.consumptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  drink_type_id UUID REFERENCES public.drink_types(id) ON DELETE RESTRICT NOT NULL,
  quantity INTEGER DEFAULT 1 NOT NULL,
  consumed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Create Friendships Table
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  addressee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(requester_id, addressee_id)
);

-- 6. Create Drink Reactions Table
CREATE TABLE IF NOT EXISTS public.drink_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consumption_id UUID REFERENCES public.consumptions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(consumption_id, user_id, emoji)
);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drink_reactions ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can read profiles. Users can only update their own.
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Drink Types: Everyone can read. Users can manage their own custom drinks (created_by = them).
CREATE POLICY "Drink types are viewable by everyone." ON public.drink_types FOR SELECT USING (true);
CREATE POLICY "Users can insert their own drink types." ON public.drink_types FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update their own drink types." ON public.drink_types FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete their own drink types." ON public.drink_types FOR DELETE USING (auth.uid() = created_by);

-- Consumptions: Users can read all consumptions (for social feed). Users can only insert/update/delete their own.
CREATE POLICY "Consumptions are viewable by everyone." ON public.consumptions FOR SELECT USING (true);
CREATE POLICY "Users can insert their own consumptions." ON public.consumptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own consumptions." ON public.consumptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own consumptions." ON public.consumptions FOR DELETE USING (auth.uid() = user_id);

-- Friendships: Users can view friendships they are part of. Users can create friendships where they are the requester.
CREATE POLICY "Users can view their friendships." ON public.friendships FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Users can insert friendships." ON public.friendships FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can update friendships they are part of." ON public.friendships FOR UPDATE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Drink Reactions: Everyone can view. Users can create/delete their own reactions.
CREATE POLICY "Reactions are viewable by everyone." ON public.drink_reactions FOR SELECT USING (true);
CREATE POLICY "Users can insert their own reactions." ON public.drink_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reactions." ON public.drink_reactions FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- REALTIME
-- ==========================================
-- Enable replication for consumptions and drink_reactions
alter publication supabase_realtime add table public.consumptions;
alter publication supabase_realtime add table public.drink_reactions;

-- ==========================================
-- TRIGGERS
-- ==========================================

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'username',
    COALESCE(new.raw_user_meta_data->>'display_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call handle_new_user on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ==========================================
-- SEED DATA (Drink Types)
-- ==========================================

INSERT INTO public.drink_types (name, category, volume_ml, alcohol_percentage, standard_units, icon, color) VALUES
('Beer (Small)', 'Beer', 250, 5.0, 1.0, 'Beer', '#F59E0B'),
('Beer (Pint)', 'Beer', 500, 5.0, 2.0, 'Beer', '#F59E0B'),
('Red Wine', 'Wine', 150, 13.0, 1.5, 'Wine', '#9F1239'),
('White Wine', 'Wine', 150, 12.0, 1.4, 'Wine', '#FEF08A'),
('Cocktail', 'Mixed', 200, 15.0, 2.4, 'Martini', '#EC4899'),
('Shot (Vodka/Tequila)', 'Spirits', 40, 40.0, 1.3, 'GlassWater', '#E2E8F0'),
('Whiskey', 'Spirits', 50, 40.0, 1.6, 'GlassWater', '#B45309'),
('Aperol Spritz', 'Mixed', 250, 11.0, 2.2, 'Martini', '#EA580C')
ON CONFLICT DO NOTHING;
