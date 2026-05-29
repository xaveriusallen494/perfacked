-- Run this in your Supabase SQL Editor
INSERT INTO public.drink_types (name, category, volume_ml, alcohol_percentage, standard_units, icon, color, image_url) VALUES
('Stella Artois', 'Pilsner', 330, 5.2, 1.7, 'Beer', '#FCD34D', '/drinks/stella-artois.jpg'),
('Duvel', 'Strong Blonde', 330, 8.5, 2.8, 'Beer', '#FDE68A', NULL),
('Westmalle Tripel', 'Trappist', 330, 9.5, 3.1, 'Beer', '#FBBF24', '/drinks/westmalle-tripel.jpg'),
('Leffe Blond', 'Blonde Ale', 330, 6.6, 2.2, 'Beer', '#F59E0B', '/drinks/leffe-blond.jpg'),
('La Chouffe', 'Strong Blonde', 330, 8.0, 2.6, 'Beer', '#FCD34D', NULL),
('Karmeliet Tripel', 'Tripel', 330, 8.4, 2.8, 'Beer', '#FDE047', '/drinks/karmeliet-tripel.jpg'),
('Orval', 'Trappist', 330, 6.2, 2.0, 'Beer', '#D97706', '/drinks/orval.jpg'),
('Kriek (Cherry)', 'Lambic', 250, 4.0, 1.0, 'Wine', '#BE123C', NULL),
('Chimay Bleue', 'Strong Dark', 330, 9.0, 3.0, 'Beer', '#78350F', '/drinks/chimay-bleue.jpg'),
('Rochefort 10', 'Quadrupel', 330, 11.3, 3.7, 'Beer', '#451A03', '/drinks/rochefort-10.jpg'),
('Ouden Duiker', 'Amber Ale', 330, 7.5, 2.5, 'Beer', '#B45309', '/drinks/ouden.png')
ON CONFLICT DO NOTHING;
