import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import ws from 'ws';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

// Polyfill WebSocket for Node.js < 22 if Supabase wants to connect
if (!globalThis.WebSocket) {
  (globalThis as any).WebSocket = ws;
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const belgianDrinks = [
  { name: 'Stella Artois', category: 'Pilsner', volume_ml: 330, alcohol_percentage: 5.2, standard_units: 1.7, icon: 'Beer', color: '#FCD34D', image_url: '/drinks/stella-artois.jpg' },
  { name: 'Duvel', category: 'Strong Blonde', volume_ml: 330, alcohol_percentage: 8.5, standard_units: 2.8, icon: 'Beer', color: '#FDE68A', image_url: null },
  { name: 'Westmalle Tripel', category: 'Trappist', volume_ml: 330, alcohol_percentage: 9.5, standard_units: 3.1, icon: 'Beer', color: '#FBBF24', image_url: '/drinks/westmalle-tripel.jpg' },
  { name: 'Leffe Blond', category: 'Blonde Ale', volume_ml: 330, alcohol_percentage: 6.6, standard_units: 2.2, icon: 'Beer', color: '#F59E0B', image_url: '/drinks/leffe-blond.jpg' },
  { name: 'La Chouffe', category: 'Strong Blonde', volume_ml: 330, alcohol_percentage: 8.0, standard_units: 2.6, icon: 'Beer', color: '#FCD34D', image_url: null },
  { name: 'Karmeliet Tripel', category: 'Tripel', volume_ml: 330, alcohol_percentage: 8.4, standard_units: 2.8, icon: 'Beer', color: '#FDE047', image_url: '/drinks/karmeliet-tripel.jpg' },
  { name: 'Orval', category: 'Trappist', volume_ml: 330, alcohol_percentage: 6.2, standard_units: 2.0, icon: 'Beer', color: '#D97706', image_url: '/drinks/orval.jpg' },
  { name: 'Kriek (Cherry)', category: 'Lambic', volume_ml: 250, alcohol_percentage: 4.0, standard_units: 1.0, icon: 'Wine', color: '#BE123C', image_url: null },
  { name: 'Chimay Bleue', category: 'Strong Dark', volume_ml: 330, alcohol_percentage: 9.0, standard_units: 3.0, icon: 'Beer', color: '#78350F', image_url: '/drinks/chimay-bleue.jpg' },
  { name: 'Rochefort 10', category: 'Quadrupel', volume_ml: 330, alcohol_percentage: 11.3, standard_units: 3.7, icon: 'Beer', color: '#451A03', image_url: '/drinks/rochefort-10.jpg' },
  { name: 'Ouden Duiker', category: 'Amber Ale', volume_ml: 330, alcohol_percentage: 7.5, standard_units: 2.5, icon: 'Beer', color: '#B45309', image_url: '/drinks/ouden.png' }
];

async function seed() {
  console.log('Seeding Belgian drinks...');
  const { data, error } = await supabase.from('drink_types').insert(belgianDrinks);
  if (error) {
    console.error('Error seeding data:', error);
  } else {
    console.log('Successfully added Belgian drinks!');
  }
}

seed();
