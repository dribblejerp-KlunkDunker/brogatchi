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

// 'Time until empty' estimates for the stat-bar hints. These mirror tick()'s
// math exactly so the countdown is honest: hunger 1/tick, happy 0.5 + mess
// penalty per tick, energy 0.5/tick (or +5 regen while asleep), tick = 15s,// sleeping multiplies decay by 0.2. Greed isn't here — it has no clock.
export const TICK_SECONDS = 15;

export function emptyEtas(stats, { sleeping = false, poop = 0, clutterCount = 0 } = {}) {
  const mod = sleeping ? 0.2 : 1;
  const perTick = {
    happy: (0.5 + (clutterCount * 0.5 + poop * 1) * 0.5) * mod,
    hunger: 1 * mod,
    energy: sleeping ? -5 : 0.5, // negative = regenerating
  };
  const eta = (v, rate) => {
    if (rate <= 0) return Infinity; // regenerating or static: never empties
    return Math.ceil((v / rate) * TICK_SECONDS / 60); // minutes until 0
  };
  return {
    happy: eta(stats.happy, perTick.happy),
    hunger: eta(stats.hunger, perTick.hunger),
    energy: eta(stats.energy, perTick.energy),
  };
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