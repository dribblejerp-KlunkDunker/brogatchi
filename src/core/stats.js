// Pure stat math — no DOM, fully unit-testable.

export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function initialStats() {
  return { happy: 80, hunger: 75, energy: 100, weight: 1.0 };
}

// One 15-second survival tick. Returns a NEW stats object (immutable-ish).
// Decay is intentionally gentle: Ryan shouldn't need feeding every quarter hour.
export function tick(stats, { sleeping = false, poop = 0, clutterCount = 0 } = {}) {
  const mod = sleeping ? 0.2 : 1;
  const dirtyPen = clutterCount * 0.5 + poop * 1;
  const s = { ...stats };
  s.hunger = clamp(s.hunger - 1 * mod);
  s.happy = clamp(s.happy - (0.5 + dirtyPen * 0.5) * mod);
  s.energy = sleeping ? clamp(s.energy + 5) : clamp(s.energy - 0.5);
  if (s.hunger < 20) s.weight = Math.max(1.0, s.weight - 0.05);
  return s;
}

// Offline decay: returns new stats + coin gain from a passive miner.
export function applyOffline(stats, mins, { hasMiner = false } = {}) {
  if (mins <= 0) return { stats: { ...stats }, coins: 0 };
  const s = { ...stats };
  s.hunger = clamp(s.hunger - mins * 0.25);
  s.happy = clamp(s.happy - mins * 0.2);
  const minerCoins = hasMiner ? Math.floor(mins * 5) : 0;
  return { stats: s, coins: minerCoins };
}

export const FOODS = {
  salad:  { restore: 15, cost: 0,  weight: 0.01, energy: false, emoji: '🥗', label: 'Salad' },
  pizza:  { restore: 30, cost: 5,  weight: 0.10, energy: false, emoji: '🍕', label: 'Pizza' },
  burger: { restore: 45, cost: 10, weight: 0.15, energy: false, emoji: '🍔', label: 'Burger' },
  energy: { restore: 20, cost: 15, weight: 0.02, energy: true,  emoji: '⚡', label: 'G-Fuel' },
};

// Weight tiers drive Ryan's visible physique (1 = twig, 5 = absolute unit).
export function weightTier(weight) {
  if (weight < 1.15) return 1;
  if (weight < 1.4) return 2;
  if (weight < 1.75) return 3;
  if (weight < 2.3) return 4;
  return 5;
}

export const TIER_NAMES = [
  '',
  'Slim',
  'Lean',
  'Bulk',
  'Plump',
  'ULTRA CHONK',
];