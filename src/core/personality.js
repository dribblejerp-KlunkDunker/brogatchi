// Ryan's personality: 6 trait axes that drift with interactions.
// Traits feed BOTH the local dialogue line picker AND the AI persona prompt.

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

// Event-driven nudges. `events` = [{ trait, amount }]
export function applyEvents(personality, events) {
  for (const e of events) {
    if (TRAITS.some((t) => t.key === e.trait)) adjust(personality, e.trait, e.amount);
  }
}

// Slow ambient drift once per minute so traits breathe over a day.
export function minuteDrift(personality, state) {
  if (state.stats.hunger < 30) adjust(personality, 'paranoia', 0.15);
  if (state.stats.energy < 20) adjust(personality, 'paranoia', 0.1);
  if (state.stats.happy > 75) adjust(personality, 'ego', 0.1);
  if (state.stats.weight >= 2.0) adjust(personality, 'gluttony', 0.1);
  if (state.steps === 0 && state.stats.weight < 2.0) adjust(personality, 'fitness', -0.2);
  if (state.coins >= 100) adjust(personality, 'greed', 0.1);
  if (state.coins < 30) adjust(personality, 'greed', -0.15);
}

export function dominant(state) {
  const p = state.personality;
  let best = 'broCode';
  let bestVal = -1;
  for (const t of TRAITS) {
    if (p[t.key] > bestVal) {
      bestVal = p[t.key];
      best = t.key;
    }
  }
  return best;
}

export function describe(state) {
  const p = state.personality;
  const parts = TRAITS.map((t) => `${t.label} ${Math.round(p[t.key])}%`);
  return parts.join(' · ');
}