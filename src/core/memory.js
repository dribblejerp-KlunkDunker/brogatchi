// Ryan's memory: tagged event log (capped, importance-ranked) + end-of-day diary.

const MAX_MEMORIES = 14;
const MAX_DIARIES = 7;

function dayString() {
  return new Date().toLocaleDateString();
}

export function remember(memories, { icon = '🪙', text, imp = 2 }) {
  if (!text) return memories;
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, icon, text, imp, day: dayString() };
  const next = [...memories, entry];
  next.sort((a, b) => b.imp - a.imp || b.id.localeCompare(a.id));
  return next.slice(0, MAX_MEMORIES);
}

// Rule-based diary lines based on what actually happened today.
export function buildDayLines(state) {
  const c = state.counters;
  const lines = [];
  const bits = [];
  if (c.pizzas > 0) bits.push(`${c.pizzas} pizza${c.pizzas > 1 ? 's' : ''}`);
  if (c.burgers > 0) bits.push(`${c.burgers} burger${c.burgers > 1 ? 's' : ''}`);
  if (c.gamesWon > 0) bits.push(`won ${c.gamesWon} game${c.gamesWon > 1 ? 's' : ''}`);
  if (c.hacks > 0) bits.push(`hacked ${c.hacks} mainframe${c.hacks > 1 ? 's' : ''}`);
  if (c.salads > 0) bits.push(`ate ${c.salads} salad${c.salads > 1 ? 's' : ''}`);
  if (state.steps > 0) bits.push(`${state.steps.toLocaleString()} steps`);
  if (bits.length) lines.push(`Did ${bits.join(', ')}.`);
  if (state.stats.weight >= 2.0) lines.push(`The midnight snacks are catching up. Ping went UP.`);
  else if (state.stats.weight < 1.3 && state.steps > 2000) lines.push(`Feelin' light. Might actually outrun a fed today.`);
  if (state.stats.hunger < 25) lines.push(`Went to sleep hungry. Devs nerfed the vending machines.`);
  if (state.stats.happy < 25) lines.push(`Rough day. Even the capybaras could tell.`);
  if (state.stats.happy >= 85) lines.push(`Perfect day vibes. Jury's out on why. Probably the RGB.`);
  if (!lines.length) lines.push('Pretty quiet day. Suspiciously quiet.');
  return lines;
}

export function addDiaryEntry(diaries, date, lines) {
  const next = diaries.filter((d) => d.date !== date);
  next.unshift({ date, lines });
  return next.slice(0, MAX_DIARIES);
}