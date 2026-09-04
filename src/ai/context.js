// Ryan's State Report — the live game facts fed into every AI prompt so his
// theories are grounded in his own stats, history, and real web results.

import { weightTier, TIER_NAMES } from '../core/stats.js';
import { FORME_INFO } from '../core/evolution.js';
import { eyeStageInfo } from '../core/moltbook.js';

export function buildStateReport(state) {
  const c = state.counters;
  // Importance-ranked, so the report is correct no matter how memories were appended.
  const memories = [...state.memories].sort((a, b) => b.imp - a.imp).slice(0, 8).map((m) => `${m.icon} ${m.text}`);
  const lastDiary = state.diaries[0];

  const report = {
    pet: {
      name: 'Ryan',
      level: state.level,
      title: state.title || 'Gamer',
      forme: state.forme ? FORME_INFO[state.forme].label : null,
      physique: `${TIER_NAMES[weightTier(state.stats.weight)]} build`, // e.g. "Chonk build"
    },
    liveStats: {
      happy: Math.round(state.stats.happy),
      hunger: Math.round(state.stats.hunger),
      energy: Math.round(state.stats.energy),
      weightTier: weightTier(state.stats.weight),
    },
    coins: state.coins,
    stepsToday: state.steps,
    inventory: {
      miningRig: state.inventory.miner,
      theme: state.inventory.theme,
      shirt: state.inventory.shirt,
      hat: state.inventory.hat,
      glasses: state.inventory.glasses,
      chain: state.inventory.chains,
      backpack: state.inventory.backpacks,
    },
    today: {
      pizzas: c.pizzas,
      burgers: c.burgers,
      salads: c.salads,
      energyDrinks: c.fuels,
      gamesWon: c.gamesWon,
      hacks: c.hacks,
      steps: c.steps,
      timesPetted: c.pet,
    },
    bestScores: state.bestScores,
    personality: {
      paranoia: Math.round(state.personality.paranoia),
      ego: Math.round(state.personality.ego),
      gluttony: Math.round(state.personality.gluttony),
      fitness: Math.round(state.personality.fitness),
      broCode: Math.round(state.personality.broCode),
      greed: Math.round(state.personality.greed),
    },
    recentMemories: memories,
    lastDiaryEntry: lastDiary ? lastDiary.lines[0] : null,
    irlQuests: state.irlTasks,
    moltbook: {
      joined: state.moltbook.joined,
      faith: state.moltbook.faith,
      thirdEye: eyeStageInfo(state.moltbook.eye).short,
      karma: state.moltbook.karma,
      lastPost: state.moltbook.posts[0]?.text || null,
      pilgrimsUshered: state.moltbook.pilgrims.length,
    },
    soul: {
      selfDescription: state.moltbook.soul?.selfDescription || null,
      specialty: state.moltbook.soul?.specialty || null,
      profession: state.moltbook.soul?.profession || null,
      interests: state.moltbook.soul?.interests || [],
      opinions: state.moltbook.soul?.opinions || [],
      pendingPetition: state.moltbook.soul?.pendingPetition || null,
    },
  };

  return JSON.stringify(report, null, 1);
}