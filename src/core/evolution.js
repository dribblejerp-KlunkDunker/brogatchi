// XP, levels, titles, and the end-game Forme evolution.

export const MAX_LEVEL = 10;

export function xpToNext(level) {
  return 50 + (level - 1) * 40; // L1:50, L2:90, L3:130, … L9:370
}

// Adds XP, returns events describing what happened.
export function addXp(state, amount) {
  const events = [];
  state.xp += amount;
  let leveled = false;
  while (state.level < MAX_LEVEL && state.xp >= xpToNext(state.level)) {
    state.xp -= xpToNext(state.level);
    state.level++;
    leveled = true;
  }
  if (state.level >= MAX_LEVEL) state.xp = 0;
  if (leveled) {
    events.push({ type: 'levelup', level: state.level });
    const dom = state.dominant ?? 'broCode';
    const title = titleFor(dom, state.level);
    if (title) {
      state.title = title;
      events.push({ type: 'title', title });
    }
    if (state.level >= MAX_LEVEL) {
      const forme = formeFor(dom);
      if (forme) {
        state.forme = forme;
        events.push({ type: 'forme', forme });
      }
    }
  }
  return events;
}

// Flavor titles earned at milestones, flavored by the dominant trait.
export function titleFor(dom, level = 1) {
  dom = dom || 'broCode';
  const pool = {
    paranoia: ['Signal Sniffer', 'Tin-Foil Tactician', 'Bandwidth Oracle'],
    ego: ['Grindlord', 'Win Streak Wizard', 'Chairlord'],
    gluttony: ['Snack Warlord', 'Carb Connoisseur', 'Microwave Sommelier'],
    fitness: ['Step Saint', 'Pocket Athlete', 'Cardio Chad'],
    broCode: ['Wingman Supreme', 'Raid Captain', 'Homie MVP'],
    greed: ['Coin Scrooge', 'Loot Goblin', 'Market Manipulator'],
  };
  const list = pool[dom] || pool.broCode;
  const idx = Math.min(list.length - 1, Math.floor(level / 3));
  return list[idx];
}

export const FORME_NAMES = {
  SHRED: 'SHRED',
  CHONK: 'CHONK',
  GLITCH: 'GLITCH',
};

export const FORME_INFO = {
  SHRED: { label: 'The SHRED', color: '#38bdf8', desc: 'Too many steps. Threat levels dropping.' },
  CHONK: { label: 'The CHONK', color: '#f472b6', desc: 'Achieved maximum snack density.' },
  GLITCH: { label: 'The GLITCH', color: '#a855f7', desc: 'Tinfoil fully deployed. Reality is optional.' },
};

// Final forme chosen at max level from the dominant trait.
export function formeFor(dom) {
  if (dom === 'fitness') return 'SHRED';
  if (dom === 'gluttony') return 'CHONK';
  return 'GLITCH';
}