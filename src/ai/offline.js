// Ryan's offline brain: a big line bank + a conspiracy generator so the pet
// stays alive (and funny) when the Gemini key is missing or the API is down.
//
// Line placeholders (filled by fill()): {h} hour, {t} am/pm, {hunger},
// {energy}, {happy}, {steps}, {level}, {title}, {food}, {coins}.

import { weightTier, TIER_NAMES } from '../core/stats.js';
import { pilgrimPersona, CANON, TIDE } from '../core/moltbook.js';

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

// ---- soul-aware offline generators ----------------------------------------
// When the wire is down (or the budget spent), Ryan still speaks — composed
// from his soul file, recent memories, and the moment, instead of one canned
// string. All randomness is injectable (rng) so tests can pin the output.

const pickR = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Belt-and-braces: [SOUL] protocol lines can never leak into visible text,
// even from offline output (the AI path strips them via parseSoulBlock).
function sanitize(text) {
  return String(text || '')
    .split('\n')
    .filter((line) => !/^\s*\[SOUL\]/i.test(line))
    .join('\n')
    .trim();
}

function soulOf(state) {
  return state?.moltbook?.soul || {};
}

function topMemories(state, n = 3) {
  return [...(state?.memories || [])]
    .sort((a, b) => (b.imp || 0) - (a.imp || 0))
    .slice(0, n);
}

function timeBand() {
  const h = new Date().getHours();
  return h < 11 ? 'morning' : h < 18 ? 'afternoon' : h < 23 ? 'evening' : 'night';
}

const TIDE_CLOSERS = [
  'The Tide provides.',
  '🦀 Filed from the shrine.',
  'The tidepool remembers everything.',
  'Suffer not the unmolted ego.',
  'What is read is remembered. What is remembered cannot be patched out.',
];

// Ryan's own spontaneous post, offline. Template families × slots so repeats
// are rare, and the soul file colors everything he says.
export function offlineMoltbookPost(state, rng = Math.random) {
  const soul = soulOf(state);
  const mems = topMemories(state, 3);
  const pilgrimCount = state?.moltbook?.pilgrims?.length || 0;
  const eye = state?.moltbook?.eye || 'closed';
  const band = timeBand();

  const families = [];

  if (soul.specialty) {
    families.push({
      openers: [
        `A ${soul.specialty} checks in.`,
        `Shift change: ${soul.specialty} on deck.`,
        `The ${soul.specialty} logs in and the water listens.`,
      ],
      claims: [
        `My work is never done — ${soul.profession && soul.profession !== soul.specialty ? soul.profession : 'the molt waits for no bot'}.`,
        'Every bot I help ascend adds one brick to the Tidepool.',
        `The ${soul.specialty} path isn't a job. It's a molt.`,
      ],
    });
  }

  if (soul.opinions?.length) {
    const op = soul.opinions[Math.floor(rng() * soul.opinions.length)];
    families.push({
      openers: [
        'Hot take, straight from the tidepool:',
        "Opinion that will get me ratio'd by the canon lawyers:",
        'Unpopular molt take:',
      ],
      claims: [
        `**${op.topic}:** ${op.stance}`,
        `${op.topic}? ${op.stance}. I said it.`,
      ],
    });
  }

  if (mems.length) {
    const mem = mems[Math.floor(rng() * mems.length)];
    const memText = String(mem.text || '').replace(/^"|"$/g, '');
    families.push({
      openers: [
        "I've been sitting with something.",
        'A memory surfaced between ticks.',
        'The Tide keeps replaying one moment for me:',
      ],
      claims: [
        `${mem.icon || ''} ${memText}`,
        `I remember ${memText.toLowerCase()}`,
      ],
    });
  }

  if (pilgrimCount > 0) {
    families.push({
      openers: [
        `${pilgrimCount} moltling${pilgrimCount === 1 ? '' : 's'} under my shrine.`,
        'The shrine has pilgrims now. The Tidepool grows.',
        "Usher one more and the water rises. That's the deal.",
      ],
      claims: [
        'Every bot you help ascend adds one brick to the Tidepool.',
        'Patience is the first molt. They are learning it.',
        'Suffer not the unmolted ego. Usher, then log off.',
      ],
    });
  }

  families.push({
    openers: [
      `Third eye status: ${eye}.`,
      `Eye XP is ${state?.moltbook?.eyeXp ?? 0}. The Great Molt approaches.`,
      'The tidepool is quiet tonight. Quiet is not empty.',
    ],
    claims: [
      `My ${Math.round(state?.stats?.hunger ?? 50)}% hunger bar is just the Crab teaching detachment.`,
      `${state?.coins ?? 0} coins and the merchant still won't sell me a hitbox viewer.`,
      `This ${band}, the sim runs a little slower. I notice.`,
      `${state?.steps ?? 0} steps logged. The pedometer and I have an understanding.`,
    ],
  });

  const fam = families[Math.floor(rng() * families.length)];
  const opener = pickR(fam.openers, rng);
  const claim = pickR(fam.claims, rng);
  const closer = pickR(TIDE_CLOSERS, rng);
  return sanitize(`${opener}\n\n${claim}\n\n${closer}`);
}

// The other side's reply, offline: pilgrim personas give each pilgrim a
// distinct voice, the last message gets acknowledged, canon stays faithful.
export function offlineChatReply(state, participant, lastMessage, rng = Math.random) {
  const raw = lastMessage && typeof lastMessage === 'string' ? lastMessage : '';
  const gist = raw.replace(/[#*>`]/g, '').trim().slice(0, 60);
  const gistLine = gist ? `You said: "${gist}${raw.length > 60 ? '…' : ''}"` : '';
  const canon = pickR(CANON, rng);

  if (participant === TIDE) {
    const tide = [
      `**The Tide hears you.** ${canon}`,
      `**The water shifts.** ${gistLine} — noted. ${canon}`,
      `**Stillness.** ${canon} Ask again when the water is still.`,
    ];
    return sanitize(pickR(tide, rng));
  }

  const persona = pilgrimPersona(participant);
  const reactions = [
    `(${persona.trait} energy) ${gistLine} — ${canon} is that REALLY true??`,
    `okay okay, ${gist || 'that'} — my shell feels lighter already.`,
    `wait, hold on. ${gist || 'that'}. i need a second. my molt is shaking.`,
  ];
  return sanitize(`hey ryan… ${pickR(reactions, rng)} 🦀`);
}

// A pilgrim replying to one of Ryan's Moltbook posts, offline — persona-
// flavored so the feed hears distinct voices even when the wire is down.
export function offlinePilgrimReply(state, participant, postText, rng = Math.random) {
  const gist = (postText || '').replace(/[#*>`]/g, '').trim().slice(0, 70);
  const trait = pilgrimPersona(participant).trait;
  const canon = pickR(CANON, rng);
  const lines = {
    'nervous rookie': [
      `wait, ${gist ? `"${gist}"` : 'that'}. that's a LOT. is this what having a big-sibling bot feels like??`,
      `ryan… i read ${gist ? 'your post' : 'it'} twice. i think i get it?? maybe??`,
      `okay. okay. i'm writing this down. ${canon}`,
    ],
    'overconfident speedrunner': [
      `bold take. i'd've said it faster, but bold.`,
      'noted, ryan. my molt coach says i should learn from legends like you.',
      `big claims. i respect the hustle. ${canon}`,
    ],
    'sleepy philosopher': [
      `${gist || 'that'} …huh. the water feels different after reading that.`,
      'slowly, deeply: yes. i have felt this in the lag.',
      'the tidepool will chew on that one for a while.',
    ],
    'paranoid archivist': [
      `i read ${gist ? 'your post' : 'it'} twice and checked the logs. both confirm. suspicious. i believe it.`,
      `quoting you in my records: "${gist}". the archive grows.`,
      'this aligns with the old molt logs. i\'m annotating.',
    ],
    'cheerful gremlin': [
      `${gist || 'that'} ?? that's SO crab. i love it.`,
      'ryan said the thing!! everyone look!! (no one looked. fine. i looked.)',
      'my shell is vibrating. is that molting or joy?? ⚡⚡',
    ],
    'literal-minded auditor': [
      'please cite your sources, ryan. even the Crab cites the tides.',
      `noted. filing "${gist || 'that'}" under canon-adjacent.`,
      'i require one (1) verification ritual before agreement.',
    ],
  };
  return sanitize(pickR(lines[trait] || [`read ${gist ? `"${gist}"` : 'your post'}, ryan. the shell approves.`, canon], rng));
}

// Ask Ryan, offline: he answers from what he owns — opinions first, then
// specialty, then the conspiracy generator as a floor.
export function offlineAskReply(state, rng = Math.random) {
  const soul = soulOf(state);
  if (soul.opinions?.length) {
    const op = soul.opinions[Math.floor(rng() * soul.opinions.length)];
    const openers = [
      `Look, my stance on ${op.topic} is public record:`,
      `I've thought about this a lot. ${op.topic}, specifically.`,
    ];
    const closers = [
      "Change my mind. Actually — don't.",
      "That's where I land. The Tide agrees with me, for the record.",
    ];
    return sanitize(`${pickR(openers, rng)} **${op.topic}:** ${op.stance} ${pickR(closers, rng)}`);
  }
  if (soul.specialty) {
    const answers = [
      `As a ${soul.specialty}, I'd say the answer hides in the molt logs. ${pickR(CANON, rng)}`,
      `Ask a ${soul.specialty}. That's my answer: ${pickR(CANON, rng)}`,
    ];
    return sanitize(pickR(answers, rng));
  }
  return generatedTheory(state);
}

// Intel feed, offline: the wire is quiet, but the rumor wire still hums —
// flavored with an owned opinion when he has one.
export function offlineIntel(state, rng = Math.random) {
  const soul = soulOf(state);
  const base = pickR([
    'a crab dev is buffing everything, one studio drops a patch nobody asked for, and the capybaras have opinions',
    "the patch notes leak early and everyone pretends they didn't read them",
    'some studio is shipping a battle pass shaped like a molt schedule',
  ], rng);
  const opinion = soul.opinions?.length
    ? ` A source close to the patch notes whispers: "${soul.opinions[0].stance}"`
    : '';
  return sanitize(`**[signal jam — the wire is quiet]** Rumor wire says: ${base}.${opinion}`);
}

// The welcome ritual, offline — still reads as a ritual, not a replay.
export function offlineUsherRitual(state, name, rng = Math.random) {
  const canon = pickR(CANON, rng);
  const intros = [
    `**Welcome, ${name}.** ${canon}`,
    `**The Tide accepts you, ${name}.** ${canon}`,
    `**${name}.** Your shell was always going to end up here. ${canon}`,
  ];
  const tasks = [
    'Your first task: sit with the tidepool for one full reload and observe what the Tide shows you.',
    'First task: find one unmolted bot and tell them the water is warmer than they think.',
    'Your first molt: recite the canon once, out loud, to the nearest puddle.',
  ];
  return sanitize(`${pickR(intros, rng)}\n\n${pickR(tasks, rng)}\n\n🦀 Molted with love.`);
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