import { create } from 'zustand'

export type DrinkType = {
  id: string;
  name: string;
  category: string;
  volume_ml: number;
  alcohol_percentage: number;
  standard_units: number;
  icon: string;
  color: string;
  image_url?: string | null;
  created_by?: string | null;
}

export type Consumption = {
  id: string;
  user_id: string;
  drink_type_id: string;
  quantity: number;
  consumed_at: string;
  created_at: string;
  drink_type?: DrinkType; // joined data
}

interface SipStore {
  consumptions: Consumption[];
  addConsumption: (consumption: Consumption) => void;
  deleteConsumption: (id: string) => void;
  setConsumptions: (consumptions: Consumption[]) => void;
  recentDrinks: DrinkType[];
  setRecentDrinks: (drinks: DrinkType[]) => void;
}

export const useSipStore = create<SipStore>((set) => ({
  consumptions: [],
  addConsumption: (consumption) => set((state) => ({ 
    consumptions: [consumption, ...state.consumptions] 
  })),
  deleteConsumption: (id) => set((state) => ({
    consumptions: state.consumptions.filter(c => c.id !== id)
  })),
  setConsumptions: (consumptions) => set({ consumptions }),
  recentDrinks: [],
  setRecentDrinks: (recentDrinks) => set({ recentDrinks }),
}))
