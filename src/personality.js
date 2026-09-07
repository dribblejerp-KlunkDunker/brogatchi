// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/personality.js — RYAN'S TRAIT CORE (2.0 port)
// Restored from the 2.0 archive (src/core/personality.js): six
// trait axes that drift with interactions and feed the soul
// viewer. Arcades, meals, hacks and quests nudge the axes via
// applyEvents(); a per-minute ambient drift keeps them breathing
// over a day. Same numbers as 2.0 so old saves carry over.
// ═══════════════════════════════════════════════════════════

export const TRAITS = [
  { key: 'paranoia', label: 'Paranoia', icon: '👁️' },
  { key: 'ego', label: 'Ego', icon: '💪' },
  { key: 'gluttony', label: 'Gluttony', icon: '🍕' },
  { key: 'fitness', label: 'Fitness', icon: '👟' },
  { key: 'broCode', label: 'Bro Code', icon: '🤝' },
  { key: 'greed', label: 'Greed', icon: '🤑' },
];

export function initialPersonality() {
  return { paranoia: 20, ego: 22, gluttony: 20, fitness: 12, broCode: 15, greed: 10 };
}

export function adjust(personality, key, amount) {
  personality[key] = Math.max(0, Math.min(100, personality[key] + amount));
}

// Event-driven nudges. `events` = [{ trait, amount }] — unknown
// traits are ignored so stale saves can't invent axes.
export function applyEvents(personality, events) {
  for (const e of events) {
    if (TRAITS.some((t) => t.key === e.trait)) adjust(personality, e.trait, e.amount);
  }
}

// Slow ambient drift once per minute so traits breathe over a day.
// (3.0's ticker runs per second — the store accumulates and calls
// this on the 2.0 per-minute cadence.)
export function minuteDrift(personality, state) {
  if (state.stats.hunger < 30) adjust(personality, 'paranoia', 0.15);
  if (state.stats.energy < 20) adjust(personality, 'paranoia', 0.1);
  if (state.stats.happy > 75) adjust(personality, 'ego', 0.1);
  if (state.stats.weight >= 2.0) adjust(personality, 'gluttony', 0.1);
  if (state.steps === 0 && state.stats.weight < 2.0) adjust(personality, 'fitness', -0.2);
  if (state.coins >= 100) adjust(personality, 'greed', 0.1);
  if (state.coins < 30) adjust(personality, 'greed', -0.07);
}

// Greed has no decay clock — it drifts with the coin balance
// (rich → greedier, broke → mellower).
export function greedTrend(coins) {
  if (coins >= 100) return { dir: 'rising', label: 'coins piling up — greed feeding' };
  if (coins < 30) return { dir: 'easing', label: 'broke — greed mellowing' };
  return { dir: 'steady', label: 'balanced — greed holding' };
}

export function dominant(personality) {
  let best = 'broCode';
  let bestVal = -1;
  for (const t of TRAITS) {
    if (personality[t.key] > bestVal) {
      bestVal = personality[t.key];
      best = t.key;
    }
  }
  return best;
}

export function describe(personality) {
  return TRAITS.map((t) => `${t.label} ${Math.round(personality[t.key])}%`).join(' · ');
}
