// Evolution journal — immutable state snapshots at meaningful moments.
// Each entry stores Ryan's live SVG screenshot (as SVG markup), stats, weight
// tier, level, forme, coins, and personality, so the journal can show how he
// developed over the whole save.

import { weightTier, TIER_NAMES } from './stats.js';

export const MAX_ENTRIES = 24;

export const JOURNAL_TYPES = {
  spawn: { icon: '🐣', label: 'Born' },
  level: { icon: '⬆️', label: 'Level Up' },
  title: { icon: '🏷️', label: 'New Title' },
  forme: { icon: '🌟', label: 'Forme Evolved' },
  rig: { icon: '⛏️', label: 'Rig Deployed' },
  tier: { icon: '⚖️', label: 'Physique Change' },
  win: { icon: '🎮', label: 'First Win' },
  steps: { icon: '👟', label: 'Step Milestone' },
  weather: { icon: '🌤️', label: 'Weather Shift' },
};

function stamp() {
  const d = new Date();
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function entryFromState(state, { type, label, note = '', svg = '' }) {
  const tier = weightTier(state.stats.weight);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: stamp(),
    type,
    label,
    note,
    svg, // raw inner SVG markup of Ryan at this moment
    level: state.level,
    title: state.title,
    forme: state.forme,
    coins: state.coins,
    weight: +state.stats.weight.toFixed(2),
    tier,
    tierName: TIER_NAMES[tier],
    stats: {
      happy: Math.round(state.stats.happy),
      hunger: Math.round(state.stats.hunger),
      energy: Math.round(state.stats.energy),
    },
    personality: { ...state.personality },
    bestScores: { ...state.bestScores },
    steps: state.steps,
  };
}

export function addEntry(journal, entry) {
  const j = [...journal, entry];
  return j.length > MAX_ENTRIES ? j.slice(j.length - MAX_ENTRIES) : j;
}

// Human-readable "what changed since the last milestone" line.
export function describeChange(prev, next) {
  if (!prev) return 'Spawn point. The sim blinked awake.';
  const parts = [];
  if (next.level > prev.level) parts.push(`LV ${prev.level} → ${next.level}`);
  if (next.tier !== prev.tier) parts.push(`${tierStr(prev)} → ${tierStr(next)}`);
  if (next.forme && next.forme !== prev.forme) parts.push(`FORME: ${next.forme}`);
  const coin = next.coins - prev.coins;
  if (Math.abs(coin) >= 25) parts.push(`${coin > 0 ? '+' : '-'}${Math.abs(coin)}c`);
  const w = Math.abs(next.weight - prev.weight) >= 0.1 ? +(next.weight - prev.weight).toFixed(1) : 0;
  if (w !== 0) parts.push(`weight ${w > 0 ? '+' : ''}${w}`);
  const hp = next.stats.happy - prev.stats.happy;
  if (Math.abs(hp) >= 10) parts.push(`happiness ${hp > 0 ? '+' : ''}${hp}`);
  return parts.length ? parts.join(' · ') : 'Quiet stretch in the sim.';
}

function tierStr(e) {
  return `${e.tierName} (${e.weight})`;
}