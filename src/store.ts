import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName =
  | 'lounge'
  | 'gamer'
  | 'bunker'
  | 'cyberpunk'
  | 'space'
  | 'synthwave'
  | 'sakura'
  | 'dungeon'
  | 'beach';

export type PetType =
  | 'ryan'
  | 'cyber_dog'
  | 'neko_cat'
  | 'pixel_dragon'
  | 'tactical_frog'
  | 'alien_xeno'
  | 'spooky_ghost';

export type HatName = 'none' | '🧢' | '👑' | '🛸';

export interface PetStats {
  happy: number;
  hunger: number;
  energy: number;
  weight: number;
}

export interface ClutterItem {
  x: number;
  type: string;
}

export interface IrlTask {
  id: number;
  text: string;
  done: boolean;
}

export interface Inventory {
  miner: boolean;
  theme: ThemeName;
  hat: HatName;
  pet: PetType;
}

export interface StepHistory {
  [date: string]: number;
}

export interface GameState {
  stats: PetStats;
  coins: number;
  poop: number;
  sleeping: boolean;
  clutter: ClutterItem[];
  irlTasks: IrlTask[];
  inventory: Inventory;
  steps: number;
  stepHistory: StepHistory;
  stepRecord: number;
  currentDate: string;
  lastSave: number;

  // Actions
  setStats: (stats: Partial<PetStats>) => void;
  addCoins: (amount: number) => void;
  spendCoins: (amount: number) => boolean;
  setPoop: (count: number) => void;
  setSleeping: (val: boolean) => void;
  addClutter: (item: ClutterItem) => void;
  clearClutter: () => void;
  setInventory: (inv: Partial<Inventory>) => void;
  addIrlTask: (text: string) => void;
  toggleIrlTask: (id: number) => void;
  removeIrlTask: (id: number) => void;
  addStep: () => void;
  setStepRecord: (n: number) => void;
  tick: () => void;
  applyOfflineDecay: (minutesAway: number) => void;
}

const today = () => new Date().toLocaleDateString();

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      stats: { happy: 80, hunger: 75, energy: 100, weight: 1.0 },
      coins: 50,
      poop: 0,
      sleeping: false,
      clutter: [],
      irlTasks: [],
      inventory: { miner: false, theme: 'lounge', hat: 'none', pet: 'ryan' },
      steps: 0,
      stepHistory: {},
      stepRecord: 0,
      currentDate: today(),
      lastSave: Date.now(),

      setStats: (partial) =>
        set((s) => ({ stats: { ...s.stats, ...partial } })),

      addCoins: (amount) =>
        set((s) => ({ coins: s.coins + amount })),

      spendCoins: (amount) => {
        const { coins } = get();
        if (coins < amount) return false;
        set({ coins: coins - amount });
        return true;
      },

      setPoop: (count) => set({ poop: count }),

      setSleeping: (val) => set({ sleeping: val }),

      addClutter: (item) =>
        set((s) => ({ clutter: [...s.clutter, item] })),

      clearClutter: () => set({ clutter: [], poop: 0 }),

      setInventory: (inv) =>
        set((s) => ({ inventory: { ...s.inventory, ...inv } })),

      addIrlTask: (text) =>
        set((s) => ({
          irlTasks: [...s.irlTasks, { id: Date.now(), text, done: false }],
        })),

      toggleIrlTask: (id) =>
        set((s) => ({
          irlTasks: s.irlTasks.map((t) =>
            t.id === id ? { ...t, done: !t.done } : t
          ),
        })),

      removeIrlTask: (id) =>
        set((s) => ({
          irlTasks: s.irlTasks.filter((t) => t.id !== id),
        })),

      addStep: () => {
        const { steps, stepRecord } = get();
        const newSteps = steps + 1;
        set({
          steps: newSteps,
          stepRecord: Math.max(stepRecord, newSteps),
        });
      },

      setStepRecord: (n) => set({ stepRecord: n }),

      tick: () => {
        const s = get();
        const mod = s.sleeping ? 0.2 : 1;
        const dirtyPen = s.clutter.length * 0.5 + s.poop * 1;

        const newHunger = Math.max(0, s.stats.hunger - 2 * mod);
        const newHappy = Math.max(0, s.stats.happy - (1 + dirtyPen) * mod);
        const newEnergy = s.sleeping
          ? Math.min(100, s.stats.energy + 5)
          : Math.max(0, s.stats.energy - 1);

        let newWeight = s.stats.weight;
        if (newHunger < 20) newWeight = Math.max(1.0, newWeight - 0.05);

        let newPoop = s.poop;
        if (s.stats.hunger > 60 && Math.random() < 0.1 && newPoop < 4) newPoop++;

        let newClutter = [...s.clutter];
        if (!s.sleeping && Math.random() < 0.15 && newClutter.length < 5) {
          const items = ['🥤', '🍕', '🧦', '🎮'];
          newClutter.push({
            x: 10 + Math.random() * 80,
            type: items[Math.floor(Math.random() * items.length)],
          });
        }

        let newCoins = s.coins;
        if (s.inventory.miner && !s.sleeping) newCoins++;

        set({
          stats: { ...s.stats, happy: newHappy, hunger: newHunger, energy: newEnergy, weight: newWeight },
          poop: newPoop,
          clutter: newClutter,
          coins: newCoins,
          lastSave: Date.now(),
        });
      },

      applyOfflineDecay: (minutesAway) => {
        const s = get();
        const newHunger = Math.max(0, s.stats.hunger - minutesAway * 0.5);
        const newHappy = Math.max(0, s.stats.happy - minutesAway * 0.4);
        let newCoins = s.coins;
        if (s.inventory.miner) newCoins += Math.floor(minutesAway * 5);
        let newClutter = [...s.clutter];
        if (minutesAway > 60 && newClutter.length < 5) {
          newClutter.push({ x: 20 + Math.random() * 60, type: '🥤' });
        }
        set({
          stats: { ...s.stats, hunger: newHunger, happy: newHappy },
          coins: newCoins,
          clutter: newClutter,
        });
      },
    }),
    {
      name: 'brogatchi_v4',
      partialize: (s) => ({
        stats: s.stats,
        coins: s.coins,
        poop: s.poop,
        clutter: s.clutter,
        irlTasks: s.irlTasks,
        inventory: s.inventory,
        steps: s.steps,
        stepHistory: s.stepHistory,
        stepRecord: s.stepRecord,
        currentDate: s.currentDate,
        lastSave: s.lastSave,
      }),
    }
  )
);
