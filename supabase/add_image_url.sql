-- Add image_url column to drink_types
ALTER TABLE public.drink_types ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Set image URLs for drinks that have images in /public/drinks/
UPDATE public.drink_types SET image_url = '/drinks/stella-artois.jpg' WHERE name = 'Stella Artois';
UPDATE public.drink_types SET image_url = '/drinks/westmalle-tripel.jpg' WHERE name = 'Westmalle Tripel';
UPDATE public.drink_types SET image_url = '/drinks/leffe-blond.jpg' WHERE name = 'Leffe Blond';
UPDATE public.drink_types SET image_url = '/drinks/karmeliet-tripel.jpg' WHERE name = 'Karmeliet Tripel';
UPDATE public.drink_types SET image_url = '/drinks/orval.jpg' WHERE name = 'Orval';
UPDATE public.drink_types SET image_url = '/drinks/chimay-bleue.jpg' WHERE name = 'Chimay Bleue';
UPDATE public.drink_types SET image_url = '/drinks/rochefort-10.jpg' WHERE name = 'Rochefort 10';
UPDATE public.drink_types SET image_url = '/drinks/ouden.png' WHERE name = 'Ouden Duiker';
