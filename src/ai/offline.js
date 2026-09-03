// Ryan's offline brain: a big line bank + a conspiracy generator so the pet
// stays alive (and funny) when the Gemini key is missing or the API is down.
//
// Line placeholders (filled by fill()): {h} hour, {t} am/pm, {hunger},
// {energy}, {happy}, {steps}, {level}, {title}, {food}, {coins}.

import { weightTier, TIER_NAMES } from '../core/stats.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---- stat-grounded conspiracy generator (offline mirror of the AI) ----
export function generatedTheory(state) {
  const tierName = TIER_NAMES[weightTier(state.stats.weight)];
  const parts = [
    `my ${Math.round(state.stats.hunger)}% hunger bar is proof the devs nerfed the cafeteria`,
    `my weight hit ${state.stats.weight.toFixed(1)} (${tierName} build) and the scale ATE the evidence`,
    `${state.coins} coins and the merchant still won't sell me a hitbox viewer`,
    `my energy is ${Math.round(state.stats.energy)}% — they cap the battery to keep us offline`,
    `${state.steps} steps today and my location data still leaked to the rats`,
    `I'm level ${state.level} and NOW they nerf my favorite food`,
    `my ${state.coins} coins are being debased by the inflation patch`,
  ];
  const conspiracies = [
    'the floor is a loading screen for a bigger room',
    'capybaras are the devs\' endgame content',
    'every time I blink, the middle class loses one hitbox',
    'our footsteps are mined for movement data by the lamp-post network',
    'the fridge hums in morse and it spells "RNG"',
    'sleep is just the game re-patching',
    'the umbrella is a defunct stealth drone',
    'the air around me is the old anti-cheat still running',
  ];
  return `Okay listen. ${pick(parts)}. That's because ${pick(conspiracies)}. I checked the logs.`;
}

export function deepDiveQuestion() {
  return pick([
    'Who controls game review scores?',
    'Is the moon a giant server?',
    'What is the best keyboard for fighting reptilians?',
    'Did the dev team patch out aliens?',
    'Why do pigeons circle government buildings?',
    'Is the tutorial level actually a prison?',
  ]);
}

// ---- line banks ----
const LINES = {
  boot: [
    'Booting up. Check the patch notes, bro.',
    'System online. The toaster is DEFINITELY wired into my brain.',
    'Loading… loading… there. Your bro has spawned.',
  ],
  morning: [
    'Rise and shine territory. The capybaras are already covering the market.',
    'Morning. Energy at {energy}% which is a number.',
    'New day, new loot table. Same paranoia.',
  ],
  midday: [
    'Lunch meta: pizza or salad? The devs vote food too.',
    'Mid-lobby. Powering through.',
  ],
  evening: [
    'Night lobby hours. Kids in bed, sweats online.',
    'Evening patch check: did the buffs hit?',
  ],
  night: [
    "It's {h}{t}PM. The simulation gets quieter at night. Suspicious.",
    'Dark mode irl. Hiding from the feds.',
  ],
  hunger: [
    'HP low... need snacks...',
    'My meter is at {hunger}%. At zero I run on Windows Update.',
    'The vending machine is a myth. Brb, hunger speedrun.',
  ],
  happy: [
    "I'm tilted bro. Let's do something.",
    'Morale at {happy}%. The fun got patched out.',
  ],
  tired: [
    'Energy at {energy}%. No stamina for side quests.',
    'Battery blinking. One pixel away from gray.',
  ],
  pet: ['Ayy, respect. Happy buff applied.', "Careful, that's my controller hand.", 'Fist bump received. Felt it in the chipset.'],
  fed: [
    'HP restored. Gained mass.',
    'Chew detected. Snack pipeline: operational.',
    'Refueled. Meter says yellow, heart says RGB.',
  ],
  energyDrink: [
    "ENERGY SPIKE! Let's gooooo!",
    'Unreal frames. Everything is 240fps now.',
    "I can see the simulation's edges. They're SMILING.",
  ],
  clean: [
    'Clean environment = high FPS.',
    'Room is sanitary again. The raccoons filed a complaint.',
    'Fresh. The clutter will return. It always does.',
  ],
  sleepOn: ['AFK.', 'Going dark. The raid can wait.'],
  sleepOff: ['I am back. Missed drop?', 'Woke up. The debt floor is gone.'],
  quest: [
    'Quest complete. Ran it like a pro.',
    'Completed. That was RANKED, so obviously.',
    'Grind done. The loot is mostly dopamine.',
  ],
  irlDone: [
    'IRL LEVEL UP! Lets GO!',
    'Real-world quest DONE?! You are hacking my mental too, bro.',
    'Bro actually did the thing. Momentous.',
  ],
  steps: [
    'Step registered. Sector scanned, clean.',
    'One step for bro, one giant step for the chart.',
    'The pedometer saw movement. It was HIM. He moved.',
  ],
  pedOn: 'Pedometer active! Walk (or shake) to burn weight and farm coins!',
  pedOff: 'Pedometer offline. Couch potato mode restored.',
  miner: [
    'Rig secured. Passive crypto income engaged.',
    'The mining rig hums. It hums in Bitcoin.',
    'I can hear the future internet being made. It smells like GPU.',
  ],
  level: [
    'LEVEL UP! Level {level} now. Patch me if you can.',
    'Level {level}!! The simulation just acknowledged me.',
  ],
  forme: [
    'FORME AWAKENED. Something has changed. LOOK at me.',
    'The evolution is complete. My chair grew. The pixels respect me now.',
  ],
  title: [
    'New title for the C: {title}. Obviously earned.',
    '{title}, and I did NOT farm it. It found me.',
    'They call me {title} now. Third word in my bio.',
  ],
  hack: [
    'Billionaire comms acquired! Coins detected.',
    'Mainframe breached. They will never patch this hole.',
    'The rich are leaking data again. Delicious.',
  ],
  newDay: [
    'Good morning. The sim reset overnight. Fresh lobby.',
    'New day, new loot table, same paranoia.',
    "Yesterday's data archived. TODAY we vibe.",
  ],
  askNoKey: 'The hardline is down bro - no key in the server room. Ask again later.',
  intelFallback: [
    '<span class="text-red-400">[SIGNAL JAM - no API key set]</span> Rumor wire says: a crab dev is buffing everything, one studio drops a patch nobody asked for, and the capybaras have opinions.',
  ],
  greedy: [
    'Coins at {coins}. The vault breathes. I love the vault.',
    'Another coin banked. The market hates to see me coming.',
    'More loot secured. My wallet has its own gravitational pull.',
    'I would trade a memory card for coins. Not a memory. Never a memory.',
    'Every coin is one step closer to buying the devs out.',
  ],
  stormLine: [
    'Bro… I can feel the {condition} in my circuits. The roof is DEFINITELY leaking.',
    'Storm detected. {temp}°C outside and I am staying INDOORS. You should too.',
    'The {condition} is real. The clouds are just the simulation stress-testing the render distance.',
    'Weather alert: {condition} at {temp}°C. The feds are testing their cloud seeding again. OBVIOUSLY.',
    'Rain confirmed. Every drop is a packet of surveillance data. I counted.',
    'Thunder = the server farm rebooting. I have seen this before.',
    'The {condition} is hitting. My RGB is flickering in solidarity.',
    'Outdoor conditions: {condition}, {temp}°C. Indoor conditions: me, safe, paranoid.',
    'Lightning strike! That was either Zeus or a crypto farm exploding. 50/50.',
    '{condition} outside. The capybaras are definitely using this as cover.',
    'Atmospheric interference detected. The {condition} is scrambling the satellite link.',
    'Water falling from the sky? SUSPICIOUS. The devs are patching the overworld again.',
  ],
};

const gameWinLines = {
  flappy: ['Flappy? More like SLAPPY. The pipes tried to clip me. I clipped back.', 'Pipe clear! No cap, no respawn, all skill.'],
  breaker: ['Brick status: vaporized. Physics bends to me.', 'Breaker cleared. The rectangles had a family.'],
  mario: ['SUPER BRO LAND complete. The 5G tower is mine.', 'Beat the level AND the agency. New best.'],
  rpg: ['VICTORY. The feds cannot throttle a save file.', 'RPG won. Zeke firewall hack performed. Bargain.'],
  loot: ['LOOT SECURED. The billionaire grid just got lighter.', 'Caught it all. The leak is MY payroll now.', 'Every coin caught. The devs will never patch this leak.'],
};

// ---- public API ----
export function pickLine(category, state) {
  let bank = LINES[category];
  if (!bank) return '';
  if (typeof bank === 'function') return bank(state);
  const line = pick(Array.isArray(bank) ? bank : Object.values(bank).flat());
  return fill(line, state);
}

export function pickGameWinLine(game, state) {
  const bank = gameWinLines[game];
  return bank ? fill(pick(bank), state) : 'Win secured. Loot acquired.';
}

// Storm lines: Ryan comments on the real weather pulled from the proxy.
// Called when condition includes rain, drizzle, or thunder.
export function pickStormLine(state, condition, temp) {
  const bank = LINES.stormLine;
  if (!bank) return '';
  let line = fill(pick(bank), state);
  line = line.replaceAll('{condition}', condition || 'weather');
  line = line.replaceAll('{temp}', temp != null ? String(Math.round(temp)) : '??');
  return line;
}

const STORM_KEYWORDS = ['rain', 'drizzle', 'thunder', 'shower'];
export function isStormCondition(condition) {
  if (!condition) return false;
  const c = condition.toLowerCase();
  return STORM_KEYWORDS.some((kw) => c.includes(kw));
}

function fill(tpl, state) {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return tpl
    .replaceAll('{h}', String(h))
    .replaceAll('{t}', ampm)
    .replaceAll('{hunger}', String(Math.round(state.stats.hunger)))
    .replaceAll('{happy}', String(Math.round(state.stats.happy)))
    .replaceAll('{energy}', String(Math.round(state.stats.energy)))
    .replaceAll('{morale}', String(Math.round(state.stats.happy)))
    .replaceAll('{steps}', String(state.steps))
    .replaceAll('{level}', String(state.level))
    .replaceAll('{coins}', String(state.coins))
    .replaceAll('{title}', state.title || 'Bro');
}