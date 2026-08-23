// Data-driven Ryan: physique tiers, wardrobe catalog, and mood computation.
// Everything the SVG renderer needs to draw Ryan lives here.

import { weightTier, TIER_NAMES } from './stats.js';

// Personality trait ¯ idle animation mapping.
// Traits range 0-100; thresholds chosen to activate at meaningful values.
export function personalityIdleClasses(state) {
  const p = state.personality;
  const s = state.stats;
  const c = [];
  if (!p) return '';
  if (p.paranoia > 40) c.push('idle-shifty');
  if (p.broCode > 45) c.push('idle-bounce');
  if (p.ego > 50) c.push('idle-flex');
  if (p.gluttony > 55) c.push('idle-chonk');
  if (s.energy < 30) c.push('idle-slouch');
  return c.join(' ');
}

// -------- Physique tiers (1 = twig … 5 = absolute unit) --------
export const PHYSIQUE = {
  1: { name: TIER_NAMES[1], scale: 0.82, belly: 0, jaw: 0.9, armW: 7, legW: 6, cheeks: false },
  2: { name: TIER_NAMES[2], scale: 0.92, belly: 0, jaw: 1.0, armW: 8, legW: 7, cheeks: false },
  3: { name: TIER_NAMES[3], scale: 1.0, belly: 0, jaw: 1.05, armW: 9, legW: 8, cheeks: false },
  4: { name: TIER_NAMES[4], scale: 1.12, belly: 1.0, jaw: 1.15, armW: 10, legW: 9, cheeks: true },
  5: { name: TIER_NAMES[5], scale: 1.24, belly: 1.6, jaw: 1.25, armW: 11, legW: 10, cheeks: true },
};

// -------- Wardrobe catalog --------
export const SHIRTS = [
  { id: 'classic', name: 'Classic', price: 0, color: '#3b82f6', accent: '#2563eb', logo: '⭐' },
  { id: 'crimson', name: 'Crimson', price: 25, color: '#dc2626', accent: '#991b1b', logo: '🔥' },
  { id: 'blackout', name: 'Blackout', price: 35, color: '#1f2937', accent: '#4b5563', logo: '🖤' },
  { id: 'hacker', name: 'Hacker', price: 45, color: '#052e16', accent: '#16a34a', logo: '👾' },
  { id: 'gold', name: '24 Karat', price: 80, color: '#b45309', accent: '#f59e0b', logo: '🪙' },
  { id: 'cotton', name: 'Bubblegum', price: 30, color: '#f472b6', accent: '#be185d', logo: '🍬' },
];

export const HATS = [
  { id: 'none', name: 'None', price: 0, glyph: '🚫' },
  { id: 'cap', name: 'Cap', price: 15, glyph: '🧢' },
  { id: 'crown', name: 'Crown', price: 60, glyph: '👑' },
  { id: 'saucer', name: 'Saucer', price: 90, glyph: '🛸' },
  { id: 'propeller', name: 'Prop', price: 50, glyph: '🎩' },
];

export const GLASSES = [
  { id: 'none', name: 'None', price: 0, frame: null },
  { id: 'aviator', name: 'Aviator', price: 25, frame: '#ca8a04', lens: '#7dd3fc' },
  { id: 'shades', name: 'Shades', price: 40, frame: '#0f172a', lens: '#0f172a' },
  { id: 'visor', name: 'VR Visor', price: 70, frame: '#38bdf8', lens: 'rgba(56,189,248,0.35)' },
];

export const CHAINS = [
  { id: 'none', name: 'None', price: 0 },
  { id: 'silver', name: 'Silver', price: 30, color: '#cbd5e1', pendant: '🪙' },
  { id: 'gold', name: 'Gold', price: 75, color: '#f59e0b', pendant: '💰' },
  { id: 'dogtags', name: 'Dog Tags', price: 55, color: '#94a3b8', pendant: '🎖️' },
];

export const BACKPACKS = [
  { id: 'none', name: 'None', price: 0 },
  { id: 'tactical', name: 'Tactical', price: 65, color: '#3f3f46' },
  { id: 'satchel', name: 'Satchel', price: 45, color: '#92400e' },
];

export const PANTS = [
  { id: 'jeans', name: 'Jeans', price: 0, color: '#1e293b', accent: '#334155' },
  { id: 'cargo', name: 'Cargo', price: 20, color: '#5c4033', accent: '#3e2723' },
  { id: 'joggers', name: 'Joggers', price: 25, color: '#374151', accent: '#6b7280' },
  { id: 'shorts', name: 'Shorts', price: 15, color: '#7c3aed', accent: '#5b21b6' },
];

export const SHOES = [
  { id: 'sneakers', name: 'Sneakers', price: 0, color: '#334155', accent: '#1e293b' },
  { id: 'boots', name: 'Boots', price: 30, color: '#292524', accent: '#44403c' },
  { id: 'highTops', name: 'High-Tops', price: 35, color: '#dc2626', accent: '#991b1b' },
  { id: 'slides', name: 'Slides', price: 10, color: '#f59e0b', accent: '#b45309' },
];

export const WRISTS = [
  { id: 'none', name: 'None', price: 0 },
  { id: 'gloves', name: 'Fingerless', price: 20, color: '#1f2937', accent: '#9ca3af' },
  { id: 'band', name: 'Wristband', price: 15, color: '#f43f5e', accent: '#e11d48' },
  { id: 'gamer', name: 'Gaming Glove', price: 40, color: '#38bdf8', accent: '#0284c7' },
];

// -------- Moods --------
export function computeMood(state, flags = {}) {
  if (flags.sleeping) return 'sleepy';
  if (flags.chewing) return 'chomp';
  if (state.stats.hunger < 25) return 'hungry';
  if (state.stats.energy < 15) return 'dizzy';
  if (state.stats.happy < 30) return 'tilt';
  if (state.stats.happy >= 85) return 'giddy';
  return 'happy';
}

const MOOD_INFO = {
  happy: { label: 'Happy', emoji: '😀', eyes: 'open', mouth: 'smile' },
  giddy: { label: 'Giddy', emoji: '🤩', eyes: 'open', mouth: 'big' },
  chomp: { label: 'Munching', emoji: '😋', eyes: 'squint', mouth: 'open' },
  sleepy: { label: 'Sleepy', emoji: '😴', eyes: 'sleepy', mouth: 'flat' },
  hungry: { label: 'Starving', emoji: '🥺', eyes: 'sad', mouth: 'wobble' },
  dizzy: { label: 'Spent', emoji: '😵', eyes: 'spiral', mouth: 'flat' },
  tilt: { label: 'Tilted', emoji: '😤', eyes: 'flat', mouth: 'frown' },
};

export function moodInfo(mood) {
  return MOOD_INFO[mood] || MOOD_INFO.happy;
}

export function outfitOf(state) {
  const inv = state.inventory;
  return {
    hat: HATS.find((h) => h.id === inv.hat) || HATS[0],
    shirt: SHIRTS.find((s) => s.id === inv.shirt) || SHIRTS[0],
    pants: PANTS.find((p) => p.id === inv.pants) || PANTS[0],
    shoes: SHOES.find((s) => s.id === inv.shoes) || SHOES[0],
    glasses: GLASSES.find((g) => g.id === inv.glasses) || GLASSES[0],
    chain: CHAINS.find((c) => c.id === inv.chains) || CHAINS[0],
    wrist: WRISTS.find((w) => w.id === inv.wrist) || WRISTS[0],
    backpack: BACKPACKS.find((b) => b.id === inv.backpacks) || BACKPACKS[0],
  };
}

// Complete render spec for the view layer.
export function buildSpec(state, flags = {}) {
  const tier = weightTier(state.stats.weight);
  const physique = PHYSIQUE[tier];
  const mood = computeMood(state, flags);
  const forme = state.forme || null;
  return {
    tier,
    physique,
    mood,
    moodInfo: moodInfo(mood),
    outfit: outfitOf(state),
    forme,
    sleeping: !!flags.sleeping,
  };
}