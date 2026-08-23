// Second Bro: a simplified companion pet that lives alongside Ryan.
// Shares the coin pool but has its own trimmed stats/hunger/mood.

const SECOND_BRO_KEY = 'brogatchi_side_bro';

export function hasSecondBro(state) {
  return !!state.sideBro;
}

export function defaultSideBro() {
  return {
    name: 'Zeke',
    species: 'capybara',
    level: 1,
    hunger: 80,
    happy: 75,
    energy: 90,
    coins: 0,   // earned separately but displayed
    spawnedAt: Date.now(),
    fed: 0,
    pet: 0,
  };
}

export function spawnSecondBro(state) {
  if (state.sideBro) return false;
  if (state.coins < 75) return false;
  state.coins -= 75;
  state.sideBro = defaultSideBro();
  return true;
}

export function tickSideBro(state, sleeping) {
  if (!state.sideBro) return;
  const sb = state.sideBro;
  if (!sleeping) {
    sb.hunger = Math.max(0, sb.hunger - 1.5);
    sb.energy = Math.max(0, sb.energy - 0.8);
    sb.happy = Math.max(0, sb.happy - 0.3);
  }
  // Stat floor
  sb.hunger = Math.max(0, Math.min(100, sb.hunger));
  sb.energy = Math.max(0, Math.min(100, sb.energy));
  sb.happy = Math.max(0, Math.min(100, sb.happy));
}

export function feedSideBro(state, amount = 25) {
  if (!state.sideBro) return false;
  state.sideBro.hunger = Math.min(100, state.sideBro.hunger + amount);
  state.sideBro.happy = Math.min(100, state.sideBro.happy + 5);
  state.sideBro.fed++;
  return true;
}

export function petSideBro(state) {
  if (!state.sideBro) return;
  state.sideBro.happy = Math.min(100, state.sideBro.happy + 3);
  state.sideBro.pet++;
  // Chance: side bro gifts a coin
  if (Math.random() < 0.3) {
    state.coins++;
    return true; // got coin
  }
  return false;
}

// Dialogue snippets for the side bro
export function sideBroLine(state) {
  if (!state.sideBro) return '';
  const sb = state.sideBro;
  if (sb.hunger < 30) return 'Zeke squeaks. Translation: snacks NOW.';
  if (sb.happy < 30) return 'Zeke stares at you. He knows what you did.';
  if (sb.energy < 20) return 'Zeke is napping. Capybara priorities.';
  const lines = [
    'Zeke grunts approvingly. You are tolerated.',
    'Zeke side-eyes Ryan. The alliance holds... barely.',
    'Zeke is plotting something. It involves oranges.',
    'The capybara observes. The simulation offends him.',
  ];
  return lines[sb.pet % lines.length];
}