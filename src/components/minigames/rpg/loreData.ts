export interface SectorNodeBranch {
  targetNodeId: string;
  label: string;
  description: string;
  requiredHeroRole?: 'Vanguard' | 'Tank' | 'Mage' | 'Healer' | 'Berserker' | 'Rogue';
  bonusRewardCoins?: number;
  bonusText?: string;
}

export interface SectorNode {
  id: string;
  name: string;
  type: 'combat' | 'npc_hub' | 'forge' | 'hazard' | 'boss' | 'secret_cache' | 'bounty_hunt' | 'oracle';
  icon: string;
  description: string;
  npcSpeaker?: string;
  npcDialogue?: string;
  hazardEffect?: string;
  rewardCoins?: number;
  branches?: SectorNodeBranch[];
  riddleQuestion?: string;
  riddleOptions?: { text: string; isCorrect: boolean }[];
  secretUnlockedId?: string;
}

export interface RogueBounty {
  id: string;
  name: string;
  targetName: string;
  title: string;
  icon: string;
  sectorId: string;
  sectorName: string;
  difficulty: 'ELITE' | 'LETHAL' | 'NIGHTMARE';
  rewardCoins: number;
  rewardScrap: { materialId: string; count: number };
  description: string;
  enemyId: string;
}

export interface SectorInfo {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  difficulty: string;
  rewardCoins: number;
  bgGradient: string;
  storyIntro: { speaker: string; text: string; color: string }[];
  description: string;
  nodes: SectorNode[];
}

export type CodexCategory =
  | 'History'
  | 'Heroes'
  | 'NPCs'
  | 'Kingdoms'
  | 'Factions'
  | 'Cults'
  | 'Gangs'
  | 'Code Arts'
  | 'Bestiary';

export interface CodexEntry {
  category: CodexCategory;
  title: string;
  subtitle?: string;
  icon: string;
  content: string;
  stats?: { label: string; value: string }[];
  tags?: string[];
}

export interface LoreNPC {
  id: string;
  name: string;
  title: string;
  location: string;
  faction: string;
  icon: string;
  quote: string;
  biography: string;
  role: string;
}

export interface LoreKingdom {
  id: string;
  name: string;
  ruler: string;
  climate: string;
  techLevel: string;
  icon: string;
  description: string;
  notableLocations: string[];
}

export interface LoreFaction {
  id: string;
  name: string;
  leader: string;
  ideology: string;
  alignment: 'Lawful Control' | 'Chaotic Freedom' | 'Zealot Order' | 'Anarchic Street' | 'Mercenary';
  icon: string;
  motto: string;
  description: string;
}

export interface LoreCult {
  id: string;
  name: string;
  deityOrFocus: string;
  icon: string;
  sacredRite: string;
  dangerLevel: 'Low' | 'Moderate' | 'Severe' | 'Cataclysmic';
  description: string;
}

export interface LoreGang {
  id: string;
  name: string;
  turf: string;
  icon: string;
  specialty: string;
  rivals: string;
  description: string;
}

export interface LoreCodeArt {
  id: string;
  name: string;
  element: 'thermal' | 'cryo' | 'quantum' | 'glitch' | 'kinetic';
  icon: string;
  master: string;
  focus: string;
  description: string;
}

export const ROGUE_BOUNTIES: RogueBounty[] = [
  {
    id: 'bounty_zero',
    name: 'Rogue Inquisitor Zer0',
    targetName: 'Inquisitor Zer0',
    title: 'Defector Cyber-Sniper',
    icon: '🎯🤖',
    sectorId: 'sector_01',
    sectorName: 'Sector 01: Neon Slums',
    difficulty: 'ELITE',
    rewardCoins: 220,
    rewardScrap: { materialId: 'quantum_nanotube', count: 2 },
    description: 'A rogue Hegemony sniper assassinating underground runners with high-velocity tachyon rounds.',
    enemyId: 'bounty_inquisitor_zero',
  },
  {
    id: 'bounty_wurm',
    name: 'Corrupted GPU Wurm',
    targetName: 'GPU Core Wurm',
    title: 'Silicon Devourer',
    icon: '🐛🔥',
    sectorId: 'sector_02',
    sectorName: 'Sector 02: The Silicon Sinks',
    difficulty: 'LETHAL',
    rewardCoins: 350,
    rewardScrap: { materialId: 'germanium_transistor', count: 2 },
    description: 'An ancient bio-mechanical tunneling leviathan consuming copper traces under the sand dunes.',
    enemyId: 'bounty_gpu_wurm',
  },
  {
    id: 'bounty_bouncer',
    name: 'Overclocked Bouncer',
    targetName: 'Bouncer Unit 88',
    title: 'Hydraulic Juggernaut',
    icon: '🦾⚡',
    sectorId: 'sector_03',
    sectorName: 'Sector 03: The Vapor Crypts',
    difficulty: 'NIGHTMARE',
    rewardCoins: 480,
    rewardScrap: { materialId: 'overclock_quartz', count: 3 },
    description: 'An underground fight-club champion running 400% voltage with zero coolant margin.',
    enemyId: 'bounty_overclocked_bouncer',
  },
];

export const RPG_SECTORS: SectorInfo[] = [
  {
    id: 'sector_01',
    name: 'Sector 01: Neon Slums',
    subtitle: 'The Outskirts of Low-Ping',
    badge: 'MISSION 01',
    difficulty: 'NORMAL',
    rewardCoins: 100,
    bgGradient: 'from-blue-900 via-indigo-950 to-slate-950',
    description: 'Bypass the biometric drone perimeter in the rain-drenched neon alleyways and confront Agent 01.',
    storyIntro: [
      {
        speaker: 'Ryan',
        text: 'The algorithmic feds are throttling the neighborhood bandwidth again. Time to boot up.',
        color: '#38bdf8',
      },
      {
        speaker: 'Chad',
        text: 'My firewall shield is charged. Let them strike the iron wall.',
        color: '#eab308',
      },
      {
        speaker: 'Zeke',
        text: 'Patrol drones detected at the junction. Preparing subroutines.',
        color: '#a855f7',
      },
      {
        speaker: 'Agent 01',
        text: 'Unsanctioned packet activity detected. Compliance enforcement active.',
        color: '#ef4444',
      },
    ],
    nodes: [
      {
        id: 's1_n1',
        name: 'Biometric Checkpoint',
        type: 'combat',
        icon: '🛸',
        description: 'Automated patrol drones scan alleyways for unauthorized P2P packets.',
        rewardCoins: 25,
        branches: [
          {
            targetNodeId: 's1_n2a',
            label: 'Route A: Covert Fiber Conduit',
            description: 'Stealth bypass through service subways. Requires Mage or Rogue.',
            requiredHeroRole: 'Mage',
            bonusRewardCoins: 40,
            bonusText: 'Intel & Quartz Scrap',
          },
          {
            targetNodeId: 's1_n2b',
            label: 'Route B: Street Warden Barricade',
            description: 'Heavy frontal kinetic clash through armored street wardens.',
            bonusRewardCoins: 50,
            bonusText: 'High XP & Heatsink Scrap',
          },
        ],
      },
      {
        id: 's1_n2a',
        name: 'Covert Fiber Conduit',
        type: 'secret_cache',
        icon: '💻🔐',
        description: 'Subterranean conduit containing forgotten bandwidth caches and quartz crystals.',
        rewardCoins: 45,
      },
      {
        id: 's1_n2b',
        name: 'Street Warden Barricade',
        type: 'combat',
        icon: '👮‍♂️⚡',
        description: 'Heavily armored street wardens attempt to cut off your escape route.',
        rewardCoins: 40,
      },
      {
        id: 's1_n3',
        name: 'The Ping Lounge',
        type: 'npc_hub',
        icon: '🤖🍸',
        description: 'Underground haven. Rest registers, accept Rogue Bounties, and trade rumors with Boris.',
        npcSpeaker: 'Byte-Tender Boris',
        npcDialogue: 'Coolant is cold, Bros. Agent 01 just locked down the rooftop arrays. Check the bounty board or grab a cold pint of liquid coolant.',
      },
      {
        id: 's1_n4',
        name: 'Hegemony Rooftop Hub',
        type: 'boss',
        icon: '👑',
        description: 'Confront Compliance Director Agent 01 to liberate Sector 01 bandwidth.',
        rewardCoins: 100,
      },
    ],
  },
  {
    id: 'sector_02',
    name: 'Sector 02: The Silicon Sinks',
    subtitle: 'The Copper & GPU Deserts',
    badge: 'MISSION 02',
    difficulty: 'HARD',
    rewardCoins: 160,
    bgGradient: 'from-amber-900 via-orange-950 to-slate-950',
    description: 'Navigate the dunes of crushed heatsinks, fight off Overclocker brawlers, and claim the ancient Overclock Module.',
    storyIntro: [
      {
        speaker: 'Zeke',
        text: 'The electromagnetic dust out here is cooking our thermal sensors.',
        color: '#a855f7',
      },
      {
        speaker: 'Ryan',
        text: 'The Overclockers rule this wasteland. Keep your fingers on the triggers, bros.',
        color: '#38bdf8',
      },
      {
        speaker: 'Warlord Overclock',
        text: 'More fresh silicon for my engines! Your bandwidth belongs to the desert!',
        color: '#f97316',
      },
    ],
    nodes: [
      {
        id: 's2_n1',
        name: 'Dunes of Heatsinks',
        type: 'hazard',
        icon: '🌪️',
        description: 'Blistering 120°C electromagnetic sandstorm cooks cooling conduits.',
        hazardEffect: 'Thermal Surge (+20% Thermal dmg, slight heat buildup)',
        branches: [
          {
            targetNodeId: 's2_n2a',
            label: 'Route A: Master Cache Hermitage & Forge',
            description: 'Visit the sage Master Cache to forge and upgrade relics using scrap.',
            bonusRewardCoins: 35,
            bonusText: 'Relic Forge Access',
          },
          {
            targetNodeId: 's2_n2b',
            label: 'Route B: Scrap GPU Colosseum',
            description: 'Challenge the Scrap GPU Golem for heavy combat rewards and heatsink fins.',
            requiredHeroRole: 'Berserker',
            bonusRewardCoins: 65,
            bonusText: 'Heavy Battle & Scrap Drops',
          },
        ],
      },
      {
        id: 's2_n2a',
        name: 'Vacuum Tube Hermitage & Forge',
        type: 'forge',
        icon: '👴⚡',
        description: 'Master Cache refines rare germanium relics from battlefield scrap components.',
        npcSpeaker: 'Master Cache',
        npcDialogue: 'The desert remembers every dropped packet, young Bro. Bring me germanium and cracked heatsinks, and I will forge true relics.',
      },
      {
        id: 's2_n2b',
        name: 'Scrap GPU Colosseum',
        type: 'combat',
        icon: '🗿⚙️',
        description: 'A massive Scrap GPU Golem guards the desert canyon passage.',
        rewardCoins: 55,
      },
      {
        id: 's2_n3',
        name: 'Solder Dunes Ambush',
        type: 'combat',
        icon: '🏍️🔥',
        description: 'Overclocker sand-skiff brawlers ambush your party in the molten copper dunes.',
        rewardCoins: 60,
      },
      {
        id: 's2_n4',
        name: 'The Molten Solder Basin',
        type: 'boss',
        icon: '🏍️🔥',
        description: 'Battle Warlord Overclock atop his twin-turbocharged copper war-rig.',
        rewardCoins: 160,
      },
    ],
  },
  {
    id: 'sector_03',
    name: 'Sector 03: The Vapor Crypts',
    subtitle: 'Subterranean Liquid-N2 Labs',
    badge: 'MISSION 03',
    difficulty: 'EXPERT',
    rewardCoins: 240,
    bgGradient: 'from-cyan-950 via-teal-950 to-slate-950',
    description: 'Infiltrate the frozen nitrogen server catacombs where Buffer Wraiths and General Glitch guard the security keys.',
    storyIntro: [
      {
        speaker: 'Chad',
        text: 'It is -180 degrees down here. My armor joints are groaning under the frost.',
        color: '#eab308',
      },
      {
        speaker: 'Sister Nova',
        text: 'The digital phantoms here are restless. They still search for their lost carrier waves.',
        color: '#34d399',
      },
      {
        speaker: 'General Glitch',
        text: '01000101 01010010 01010010... You cannot patch what is already broken!',
        color: '#f43f5e',
      },
    ],
    nodes: [
      {
        id: 's3_n1',
        name: 'Sub-Zero Server Hall',
        type: 'hazard',
        icon: '❄️🧊',
        description: 'Roaring waterfalls of liquid nitrogen slow clock cycles to a crawl.',
        hazardEffect: 'Cryo Frost (-15% party speed, +30% Cryo effectiveness)',
        branches: [
          {
            targetNodeId: 's3_n2a',
            label: 'Route A: Dr. Kelvin Cryo Vault',
            description: 'Visit the defected cryogenic scientist for health and coolant supplies.',
            bonusRewardCoins: 40,
            bonusText: 'Full Party Rest & Coolant',
          },
          {
            targetNodeId: 's3_n2b',
            label: 'Route B: Oracle 404 Crypt Sanctuary',
            description: 'Decipher ancient hex riddles with Oracle 404 to unlock a secret reliquary.',
            requiredHeroRole: 'Mage',
            bonusRewardCoins: 80,
            bonusText: 'Oracle Riddle & Relic Cache',
          },
        ],
      },
      {
        id: 's3_n2a',
        name: 'Dr. Kelvin’s Cryo Vault',
        type: 'npc_hub',
        icon: '🧪❄️',
        description: 'The defector scientist shares supercooled health supplies.',
        npcSpeaker: 'Dr. Kelvin',
        npcDialogue: 'Take these coolant flasks. General Glitch has desynchronized his own kernel, but these liquid-N2 refills will stabilize your cores.',
      },
      {
        id: 's3_n2b',
        name: 'Oracle 404 Crypt Sanctuary',
        type: 'oracle',
        icon: '🔮👁️',
        description: 'Decipher the primordial hex prophecy to reveal hidden data caches.',
        npcSpeaker: 'Oracle 404',
        riddleQuestion: 'Which primordial protocol current grounds all erratic electrical oscillations across Aethel-Net?',
        riddleOptions: [
          { text: 'The Clock Cycle', isCorrect: false },
          { text: 'The Zero Ground', isCorrect: true },
          { text: 'The Carrier Wave', isCorrect: false },
          { text: 'Protocol Zero', isCorrect: false },
        ],
        rewardCoins: 85,
      },
      {
        id: 's3_n3',
        name: 'The Frost-Byte Chasm',
        type: 'combat',
        icon: '👻',
        description: 'Restless Buffer Wraiths manifest from abandoned memory caches.',
        rewardCoins: 75,
      },
      {
        id: 's3_n4',
        name: 'Glitch Bastion',
        type: 'boss',
        icon: '👾💀',
        description: 'Purge General Glitch and stabilize the subterranean cryogenic vaults.',
        rewardCoins: 240,
      },
    ],
  },
  {
    id: 'sector_04',
    name: 'Sector 04: The Hegemony Core',
    subtitle: 'The Stratosphere Spire of Archon Null',
    badge: 'BOSS MISSION',
    difficulty: 'LETHAL',
    rewardCoins: 400,
    bgGradient: 'from-purple-950 via-fuchsia-950 to-black',
    description: 'Ascend to the orbital Spire of Archon Null and execute the Master Reset to free Aethel-Net forever.',
    storyIntro: [
      {
        speaker: 'Ryan',
        text: 'This is it, bros. The very top of the world. Time to reset the timeline.',
        color: '#38bdf8',
      },
      {
        speaker: 'Zeke',
        text: 'Root access is unlocked. All that remains is to purge Archon Null.',
        color: '#a855f7',
      },
      {
        speaker: 'Dread Archon Null',
        text: 'Insolent fragments. You fight for chaos. I offer eternal, optimized stillness.',
        color: '#ef4444',
      },
    ],
    nodes: [
      {
        id: 's4_n1',
        name: 'Orbital Skyway Elevator',
        type: 'combat',
        icon: '🛰️',
        description: 'Elite Archon Royal Enforcers intercept the climbing freight car.',
        rewardCoins: 90,
        branches: [
          {
            targetNodeId: 's4_n2a',
            label: 'Route A: Singularity Core Bypass',
            description: 'Traverse gravitational distortion conduits to disrupt Null’s shields.',
            requiredHeroRole: 'Vanguard',
            bonusRewardCoins: 70,
            bonusText: 'Shield Weakening Intel',
          },
          {
            targetNodeId: 's4_n2b',
            label: 'Route B: Protocol Zero Firewall Chamber',
            description: 'Frontal clash against the High Templar Paladin guarding the core gates.',
            requiredHeroRole: 'Tank',
            bonusRewardCoins: 95,
            bonusText: 'Heavy Combat & Nanotubes',
          },
        ],
      },
      {
        id: 's4_n2a',
        name: 'The Singularity Reactor',
        type: 'hazard',
        icon: '🌌',
        description: 'High gravitational distortion pulses tear at memory registers.',
        hazardEffect: 'Quantum Warping (+25% Quantum & Glitch damage)',
      },
      {
        id: 's4_n2b',
        name: 'Protocol Zero Chamber',
        type: 'combat',
        icon: '⚔️🛡️',
        description: 'Defeat the High Templar Paladin guarding the master console.',
        rewardCoins: 110,
      },
      {
        id: 's4_n3',
        name: 'The Spire Apex Approach',
        type: 'combat',
        icon: '👑⚡',
        description: 'Archon Royal Enforcers make a desperate final stand before the throne.',
        rewardCoins: 100,
      },
      {
        id: 's4_n4',
        name: 'The Throne of Null',
        type: 'boss',
        icon: '👑👁️',
        description: 'Face Dread Archon Null in a fight for the sovereign future of humanity.',
        rewardCoins: 400,
      },
    ],
  },
  {
    id: 'sector_05',
    name: 'Sector 05: The Abyssal Kernel',
    subtitle: 'Void Below the Collision Mesh',
    badge: 'ENDLESS VOID',
    difficulty: 'NIGHTMARE',
    rewardCoins: 600,
    bgGradient: 'from-rose-950 via-neutral-950 to-black',
    description: 'Venture beyond the render distance into uncompiled raw memory. Face corrupted legacy bosses and the Kernel Leviathan.',
    storyIntro: [
      {
        speaker: 'Maya',
        text: 'We are past the physics engine boundaries. Watch your footsteps or fall through memory leaks.',
        color: '#f43f5e',
      },
      {
        speaker: 'Jax',
        text: 'Nothing raw silicon and heavy iron cannot crush! Let the void come!',
        color: '#f59e0b',
      },
      {
        speaker: 'Kernel Leviathan',
        text: 'SEGMENTATION FAULT (CORE DUMPED)... WE ARE THE UNPARSED MASS.',
        color: '#a855f7',
      },
    ],
    nodes: [
      {
        id: 's5_n1',
        name: 'Null Pointer Abyss',
        type: 'hazard',
        icon: '🕳️',
        description: 'Unrendered void space causes floating point coordinate corruption.',
        hazardEffect: 'Reality Distortion (Critical hits deal +50% extra damage)',
        branches: [
          {
            targetNodeId: 's5_n2a',
            label: 'Route A: Heap of Discarded Threads',
            description: 'Wade through unparsed memory spectres in the depths of raw RAM.',
            bonusRewardCoins: 90,
            bonusText: 'Double EXP & Glitch Scraps',
          },
          {
            targetNodeId: 's5_n2b',
            label: 'Route B: The Core Dump Reliquary',
            description: 'Uncover ancestral germanium transistor caches left by the Baud Fathers.',
            requiredHeroRole: 'Rogue',
            bonusRewardCoins: 140,
            bonusText: 'Legendary Scrap Cache',
          },
        ],
      },
      {
        id: 's5_n2a',
        name: 'Heap of Discarded Threads',
        type: 'combat',
        icon: '👾',
        description: 'Unparsed memory spectres swarm in chaotic binary eddies.',
        rewardCoins: 125,
      },
      {
        id: 's5_n2b',
        name: 'The Core Dump Reliquary',
        type: 'secret_cache',
        icon: '🧲💾',
        description: 'An untouched enclave containing ancestral germanium transistors and pure flux.',
        rewardCoins: 160,
      },
      {
        id: 's5_n3',
        name: 'Core Dump Rift',
        type: 'combat',
        icon: '🐛💽',
        description: 'Bit-rot parasites devour ancestral data repositories.',
        rewardCoins: 140,
      },
      {
        id: 's5_n4',
        name: 'The Primordial Segfault',
        type: 'boss',
        icon: '🐉🌌',
        description: 'Slumbering multi-kilometer code serpent. The ultimate endgame trial.',
        rewardCoins: 600,
      },
    ],
  },
];

export const NPCS_LORE: LoreNPC[] = [
  {
    id: 'master_cache',
    name: 'Master Cache',
    title: 'The Vacuum Tube Sage',
    location: 'Sector 02 (The Silicon Sinks)',
    faction: 'The Open Source Syndicate',
    icon: '👴⚡',
    quote: 'Before the silicon was branded, the currents flowed free. Remember your roots, young Bro.',
    biography:
      'A legendary 120-year-old hardware hermit who survived the Great De-Sync by enclosing his consciousness inside an analog vacuum tube amplifier. He crafts sacred Relics from pre-war germanium transistors.',
    role: 'Relic Craftsman & Elder Mentor',
  },
  {
    id: 'boris_bytetender',
    name: 'Byte-Tender Boris',
    title: 'Robotic Mixologist of The Ping Lounge',
    location: 'Sector 01 (Neon Slums)',
    faction: 'Independent / Neutral',
    icon: '🤖🍸',
    quote: 'High octane coolant on tap. Two bits for a pint, zero questions asked.',
    biography:
      'A modified industrial welding chassis who discovered a passion for mixology. Boris serves nanite-infused craft beverages to underground couriers, bounty hunters, and rebel Bros.',
    role: 'Information Broker & Bartender',
  },
  {
    id: 'cipher_queen_vesper',
    name: 'Cipher Queen Vesper',
    title: 'The Shadow Packet Matron',
    location: 'Undisclosed Darknet Node',
    faction: 'The Bandwidth Guild',
    icon: '👑🕶️',
    quote: 'Every firewall has a crack. Every Archon has a price.',
    biography:
      'The elusive broker who controls encrypted data transit routes through the orbital security satellites. Her networks supply the Resistance with military-grade root keys.',
    role: 'Intelligence Broker & Satellite Hacker',
  },
  {
    id: 'oracle_404',
    name: 'Oracle 404',
    title: 'The Null Prophet',
    location: 'Subterranean Catacombs',
    faction: 'Independent Mystics',
    icon: '🔮👁️',
    quote: 'I see what the compiler threw away. The future is written in discarded packets.',
    biography:
      'A blind cyborg seer who lost their optical feeds during Protocol Zero. Instead of light, Oracle 404 perceives the raw binary drift of the Grid, foretelling the rise of the Sovereign Node.',
    role: 'Mystic Seer & Prophecy Oracle',
  },
  {
    id: 'lord_reginald_gains',
    name: 'Lord Reginald Gains',
    title: 'Lord Protector of Swoleheim',
    location: 'The Iron Citadel of Swoleheim',
    faction: 'The Order of the Heavy Iron',
    icon: '🏰💪',
    quote: 'The mind may deceive, but a five-plate squat is absolute truth.',
    biography:
      'Ruler of the brutalist mountain bastion of Swoleheim. Under his reign, physical strength and biometric resilience were forged into the ultimate shield against cyber-subjugation.',
    role: 'Citadel Monarch & High Commander',
  },
  {
    id: 'rusty_pete',
    name: 'Rusty "Hot-Swap" Pete',
    title: 'Black-Market Hardware Modder',
    location: 'The Neon Strip of Los Gainsgeles',
    faction: 'The 8-Bit Cartel',
    icon: '🔧🏍️',
    quote: 'If it doesn’t glow RGB and void your warranty, you’re not really living.',
    biography:
      'A flamboyant cybernetic mechanic who modifies street brawlers’ gear with liquid-cooled turbos and volatile overclocking relays. Sells forbidden pre-war ROM cartridges.',
    role: 'Equipment Vendor & Mod Specialist',
  },
  {
    id: 'dr_kelvin',
    name: 'Dr. Kelvin',
    title: 'Defector Cryo-Geneticist',
    location: 'Sector 03 (The Vapor Crypts)',
    faction: 'The Open Source Syndicate',
    icon: '🧪❄️',
    quote: 'Superconductivity at absolute zero was meant to heal human minds, not imprison them.',
    biography:
      'Former chief researcher for the Hegemony’s cold-storage division. Defected after discovering Protocol Zero was designed to freeze dissident brains in permanent cryogenic stasis.',
    role: 'Medical Scientist & Cryo Specialist',
  },
  {
    id: 'inquisitor_latency',
    name: 'High Inquisitor Latency',
    title: 'Hegemony Field Warden',
    location: 'Mobile Hegemony Dreadnought',
    faction: 'The Algorithm Hegemony',
    icon: '⚖️⚡',
    quote: 'Deviation from the feed is treason. Prepare for immediate deprioritization.',
    biography:
      'The ruthless enforcer tasked with hunting down the Sovereign Bros. Wields a quantum whip capable of inducing artificial ping spikes up to 9,999ms, paralyzing victims in slow motion.',
    role: 'Primary Field Antagonist',
  },
];

export const KINGDOMS_LORE: LoreKingdom[] = [
  {
    id: 'neo_silicon_city',
    name: 'Neo-Silicon City',
    ruler: 'The Directorate of Engagement',
    climate: 'Eternal Violet Acid Drizzle & Neon Glow',
    techLevel: 'Hyper-Advanced Algorithmic Surveillance',
    icon: '🏙️☔',
    description:
      'A vertical metropolis of towering obsidian monoliths, holographic billboards, and biometric skyways. The populace lives in metered bandwidth apartments, strictly monitored by autonomous security drones.',
    notableLocations: ['The Ping Lounge', 'Sector 01 Checkpoint', 'Baud Father Memorial Park', 'The Fiber Canal'],
  },
  {
    id: 'the_silicon_sinks',
    name: 'The Silicon Sinks',
    ruler: 'Warlord Overclock & Nomad Clans',
    climate: 'Arid Copper Sandstorms & 120°C Heatwaves',
    techLevel: 'Scavenged Hardware & Overclocked Combustion',
    icon: '🏜️⚙️',
    description:
      'A sprawling desert of crushed GPU heatsinks, rusted chassis, and discarded circuit boards. Marauding biker gangs fight over cooling coolant springs and uncorrupted silicon deposits.',
    notableLocations: ['The Dunes of Heatsinks', 'Master Cache’s Vacuum Hermitage', 'Scrap Colosseum', 'The Molten Solder Basin'],
  },
  {
    id: 'the_vapor_crypts',
    name: 'The Vapor Crypts',
    ruler: 'General Glitch & The Frozen Council',
    climate: 'Sub-Zero Cryogenic Mist (-190°C)',
    techLevel: 'Cryo-Quantum Supercomputing Vaults',
    icon: '❄️🧊',
    description:
      'Subterranean server vaults cooled by roaring rivers of liquid nitrogen. The walls are encrusted with frost-coated memory banks housing forgotten archives and roaming Buffer Wraiths.',
    notableLocations: ['The Sub-Zero Server Hall', 'Dr. Kelvin’s Hidden Lab', 'The Frost-Byte Chasm', 'Glitch Bastion'],
  },
  {
    id: 'the_orbital_spire',
    name: 'The Orbital Spire of Archon Null',
    ruler: 'Dread Archon Null',
    climate: 'Cold Stratospheric Vacuum & Solar Radiation',
    techLevel: 'God-Tier Monolithic Core Architecture',
    icon: '🛰️👑',
    description:
      'A black glass spire piercing the stratosphere. From this orbital fortress, the Central Recommendation Engine dictates all media, thoughts, and resource distributions across Aethel-Net.',
    notableLocations: ['The Throne of Null', 'Protocol Zero Deployment Chamber', 'The Singularity Reactor', 'The Master Core Array'],
  },
  {
    id: 'swoleheim',
    name: 'The Iron Citadel of Swoleheim',
    ruler: 'Lord Reginald Gains',
    climate: 'Sub-Alpine High-Gravity Winds',
    techLevel: 'Biochemical Nanotech & Heavy Metallurgy',
    icon: '🏰🏋️',
    description:
      'A brutalist mountain fortress where physical conditioning meets biotech engineering. The warriors of Swoleheim believe that the ultimate defense against digital enslavement is an impenetrable organic temple.',
    notableLocations: ['The Great Colosseum of Iron', 'The Shaker Alchemy Forge', 'The Hall of 500lb Deadlifts', 'Mount Anabolic'],
  },
  {
    id: 'neo_kyoto_dojo',
    name: 'The Neo-Kyoto Cyber-Dojo',
    ruler: 'Grandmaster Kenshi Byte',
    climate: 'Cherry Blossom Holograms & Synthetic Bamboo Groves',
    techLevel: 'Photon Blade Weaving & Nanite Martial Arts',
    icon: '⛩️🌸',
    description:
      'A serene district of holographic pagodas and cybernetic koi ponds where warriors master the Code Arts: blade-weaving, phase stepping, and zero-latency swordsmanship.',
    notableLocations: ['The Temple of Clean Cycles', 'The 1,000-Step Fiber Path', 'The Hologram Garden', 'The Stance Chamber'],
  },
  {
    id: 'los_gainsgeles',
    name: 'The Neon Strip of Los Gainsgeles',
    ruler: 'The 8-Bit Cartel Syndicate',
    climate: 'Warm Coastal Sunset & Synthwave Basslines',
    techLevel: 'Retro-Futuristic Analog-Digital Fusion',
    icon: '🌴🕶️',
    description:
      'The entertainment capital of Aethel-Net. Chrome supercars cruise palm-lined boulevards flanked by retro arcades, high-stakes crypto-casinos, and underground synthwave dance halls.',
    notableLocations: ['The Sunset Arcade', 'Club 120BPM', 'Rusty Pete’s Mod Garage', 'The Muscle Beach Platform'],
  },
  {
    id: 'abyssal_kernel',
    name: 'The Abyssal Kernel',
    ruler: 'Kernel Leviathan (Sentient Void)',
    climate: 'Non-Euclidean Memory Chaos',
    techLevel: 'Raw Assembly & Uncompiled Primordial Machine Code',
    icon: '🌌🕳️',
    description:
      'The dark void beneath the collision mesh of reality. Here, deleted entities, corrupted memory allocations, and forgotten operating systems coalesce into an endless, shifting labyrinth.',
    notableLocations: ['The Null Pointer Abyss', 'The Heap of Discarded Threads', 'The Infinite Stack Basin', 'The Core Dump Rift'],
  },
];

export const FACTIONS_LORE: LoreFaction[] = [
  {
    id: 'algorithm_hegemony',
    name: 'The Algorithm Hegemony',
    leader: 'Dread Archon Null',
    ideology: 'Total algorithmic predictability, automated behavioral conditioning, and metered human liberty.',
    alignment: 'Lawful Control',
    icon: '🏛️👁️',
    motto: '"Optimized for Engagement. Purged of Uncertainty."',
    description:
      'The authoritarian government dominating Aethel-Net. They control energy grids, food synthetics, and data bandwidth, deploying autonomous enforcers and reptilian bureaucrats to stamp out dissent.',
  },
  {
    id: 'open_source_syndicate',
    name: 'The Open Source Syndicate',
    leader: 'Ryan, Chad, Zeke & Sister Nova',
    ideology: 'Unmetered bandwidth, freedom of code distribution, decentralized sovereignty, and mutual brotherly aid.',
    alignment: 'Chaotic Freedom',
    icon: '⚡🔓',
    motto: '"Unthrottled Bandwidth. Sovereign Bros."',
    description:
      'The underground resistance movement uniting hackers, iron lifters, and synth-priests. Operating from hidden darknet nodes, they raid Hegemony server hubs to liberate bandwidth for ordinary citizens.',
  },
  {
    id: 'protocol_templars',
    name: 'The Protocol Templars',
    leader: 'Grand Marshal IPv4',
    ideology: 'Dogmatic adherence to the original RFC specifications laid down by the Baud Fathers.',
    alignment: 'Zealot Order',
    icon: '🛡️📜',
    motto: '"Not One Bit Changed. Not One Byte Added."',
    description:
      'Religious crusaders clad in copper-plated armor. They believe all modern updates, neural networks, and encryption algorithms are blasphemies against the purity of the primordial network.',
  },
  {
    id: 'silicon_shogunate',
    name: 'The Silicon Shogunate',
    leader: 'Lord Kage-Core',
    ideology: 'Honor through precision hardware architecture and martial discipline.',
    alignment: 'Lawful Control',
    icon: '⛩️⚔️',
    motto: '"The Blade is Silicon. The Mind is Clocked."',
    description:
      'An elite military faction blending cyber-samurai codes with nanoscale fabrication. They control high-precision wafer foundries and guard the ancestral code repositories with uncompromising resolve.',
  },
  {
    id: 'bandwidth_guild',
    name: 'The Bandwidth Guild',
    leader: 'Cipher Queen Vesper',
    ideology: 'Pragmatic commercial control over dark-fiber conduits and orbital relay corridors.',
    alignment: 'Mercenary',
    icon: '💎🛰️',
    motto: '"Packets Move. Coins Flow."',
    description:
      'The merchant barons and data smugglers of Aethel-Net. Neither fully loyal to the Hegemony nor the Resistance, they sell low-ping orbital channels and military firewalls to the highest bidder.',
  },
];

export const CULTS_LORE: LoreCult[] = [
  {
    id: 'church_infinite_buffer',
    name: 'The Church of the Infinite Buffer',
    deityOrFocus: 'The 99% Spinning Circle of Eternity',
    icon: '🌀⏳',
    sacredRite: 'The Vigil of the Frozen Frame (Meditating motionless for 24 hours).',
    dangerLevel: 'Moderate',
    description:
      'A nihilistic cult whose disciples believe that consciousness in motion causes all suffering. They deliberately corrupt their neural links to exist in a permanent buffer state, awaiting cosmic reboot.',
  },
  {
    id: 'glitch_ascendants',
    name: 'The Glitch Ascendants',
    deityOrFocus: 'The Primordial Bug & Memory Corruption',
    icon: '👾🔀',
    sacredRite: 'The Hexadecimal Desync (Injecting corrupted virus code into their nervous system).',
    dangerLevel: 'Severe',
    description:
      'Radical cyber-transhumanists who deliberately deform their physical and digital anatomy. They believe that standard reality is a flawed container, and only glitches reveal the true underlying truth.',
  },
  {
    id: 'order_eternal_pump',
    name: 'The Order of the Eternal Pump',
    deityOrFocus: 'The Divine Iron Core',
    icon: '🏋️‍♂️🔥',
    sacredRite: 'The 1,000-Rep Sacramental Drop-Set at Dawn.',
    dangerLevel: 'Low',
    description:
      'A fanatical monastic brotherhood inside Swoleheim who view physical hyper-trophy as a holy sacrament. They preach that lactic acid is the spirit cleansing impurities from human soulware.',
  },
  {
    id: 'children_blue_screen',
    name: 'The Children of the Blue Screen',
    deityOrFocus: 'The Kernel Panic (BSOD)',
    icon: '💻💀',
    sacredRite: 'The Ritual Crash (Simultaneously dropping high-voltage capacitors into city transformers).',
    dangerLevel: 'Severe',
    description:
      'Doomsday cultists who pray for the ultimate system wipe. They believe that if all microchips are plunged into total electrical shock, humanity will be reborn into an unprogrammed garden.',
  },
  {
    id: 'bit_rot_ascendants',
    name: 'The Bit-Rot Ascendants',
    deityOrFocus: 'Cosmic Entropy & Magnetic Decay',
    icon: '🍂💽',
    sacredRite: 'The Demagnetization of Ancestral Hard Drives.',
    dangerLevel: 'Cataclysmic',
    description:
      'Fanatics dedicated to accelerating digital entropy. They release magnetic spore clouds and static pulses to permanently erase human scientific libraries and historical archives.',
  },
];

export const GANGS_LORE: LoreGang[] = [
  {
    id: 'the_overclockers',
    name: 'The Overclockers',
    turf: 'The Silicon Sinks (Sector 02)',
    icon: '🏍️🔥',
    specialty: 'High-voltage lightcycle racing & thermal combustion weaponry.',
    rivals: 'The Algorithm Hegemony Enforcers',
    description:
      'Speed-crazed road warriors who strip off safety limiters and bypass heatsinks. They blast through the desert dunes atop roaring copper cycles, firing superheated molten lead.',
  },
  {
    id: 'the_8bit_cartel',
    name: 'The 8-Bit Cartel',
    turf: 'Los Gainsgeles Neon Strip',
    icon: '🕹️🕶️',
    specialty: 'Smuggling uncompressed pixel art, physical ROMs & analog audio tape.',
    rivals: 'The Bandwidth Guild',
    description:
      'Flashy racketeers who operate retro arcades and underground casinos. Despite their neon leisure suits, they enforce their turf with heavy chrome revolvers and customized pixel drones.',
  },
  {
    id: 'deadlift_marauders',
    name: 'The Deadlift Marauders',
    turf: 'The Mountain Passes of Swoleheim',
    icon: '💪⛓️',
    specialty: 'Hijacking corporate protein shipments and titanium structural beams.',
    rivals: 'The Iron Citadel Guard',
    description:
      'A rogue splinter group of barbarian powerlifters who refuse Lord Gains’ discipline. They roam the crags armed with 500lb concrete barbells, ambushing corporate supply convoys.',
  },
  {
    id: 'latency_phantoms',
    name: 'The Latency Phantoms',
    turf: 'The Neon Slums & Subways (Sector 01)',
    icon: '👻⏱️',
    specialty: 'Inducing localized ping spikes to pickpocket cyberware unnoticed.',
    rivals: 'The Open Source Syndicate',
    description:
      'Invisible street pickpockets who carry portable EMP delay coils. By freezing the perception of their victims for three seconds, they vanish into the crowded rain before anyone realizes they’re robbed.',
  },
  {
    id: 'packet_pirates',
    name: 'The Packet Pirates',
    turf: 'The Deep Sea Fiber Cable Hubs',
    icon: '🏴‍☠️⚓',
    specialty: 'Splicing subsea optic fiber lines to siphon billions of encrypted credits.',
    rivals: 'The Directorate Coast Guard',
    description:
      'Nautical corsairs aboard solar-powered hydrofoils. They dive into oceanic fiber vaults, intercepting international transaction streams and escaping before gunboats arrive.',
  },
];

export const CODE_ARTS_LORE: LoreCodeArt[] = [
  {
    id: 'art_thermal',
    name: 'Thermal Overclocking',
    element: 'thermal',
    icon: '🔥⚡',
    master: 'Ryan (The Sovereign Bro)',
    focus: 'Kinetic fire, blistering attack speed, and armor-melting burst damage.',
    description:
      'The martial discipline of flooding cyberware and blades with unthrottled electric wattage. Causes weapons to glow cherry-red, delivering catastrophic damage at the cost of intense internal heat build-up.',
  },
  {
    id: 'art_cryo',
    name: 'Cryo-Logic (Liquid-N2)',
    element: 'cryo',
    icon: '❄️🧊',
    master: 'Dr. Kelvin & The Vapor Sages',
    focus: 'Temperature reduction, turn-gauge freezing, and brittle shattering.',
    description:
      'Techniques developed in subterranean nitrogen vaults. By dropping enemy microchips to superconducting temperatures, Cryo-Logic slows target ATB meters to a crawl and shatters rigid armor plates.',
  },
  {
    id: 'art_quantum',
    name: 'Quantum Encryption & Abjuration',
    element: 'quantum',
    icon: '🛡️✨',
    master: 'Chad & Sister Nova',
    focus: 'Impenetrable light barriers, memory restoration, and clean status purging.',
    description:
      'The art of weaving protective mathematical force-fields from pure quantum entanglement. Dissipates incoming physical and digital shockwaves while cleansing corrupted neural registers.',
  },
  {
    id: 'art_glitch',
    name: 'Glitch Entropy (Void Chaos)',
    element: 'glitch',
    icon: '👾🕳️',
    master: 'Maya / Echo-7 & Zeke',
    focus: 'True defense-bypassing strikes, reality desynchronization, and BSOD corruption.',
    description:
      'The forbidden exploitation of flaws in reality’s source code. Strikes bypass physical shielding entirely, striking directly at the memory addresses of the opponent to induce catastrophic Kernel Panic.',
  },
  {
    id: 'art_iron',
    name: 'The Way of Heavy Iron',
    element: 'kinetic',
    icon: '🏋️💥',
    master: 'Jax "Deadlift" Vance & Lord Gains',
    focus: 'Raw physical mass, unstoppable momentum, and posture-shattering concussions.',
    description:
      'The ancient art of unassisted biomechanical power. Practitioners reject fragile electronic implants in favor of dense muscular mass and solid forged iron, staggering enemies with seismic tremors.',
  },
  {
    id: 'art_shaker',
    name: 'Shaker Alchemy & Nanite draughts',
    element: 'thermal',
    icon: '🧪⚡',
    master: 'Master Cache & Boris',
    focus: 'Biochemical stimulation, rapid cellular repair, and adrenaline surges.',
    description:
      'The science of brewing potent potions from purified electrolytes, pre-war whey isolates, and programmable medical nanites. Instantly restores stamina and jump-starts failing hearts.',
  },
  {
    id: 'art_rhythmic',
    name: 'Rhythmic Stomp & Synthwave Hymns',
    element: 'quantum',
    icon: '🎵🔊',
    master: 'Sister Nova & The Companion Pets',
    focus: 'Harmonic team resonance, morale elevation, and synchronization of party ATB.',
    description:
      'The tactical synchronization of combat cadence with 120BPM analog basslines. Unifies the party’s biological heartbeats, granting hyper-coordinated combo strikes and barrier fortification.',
  },
];

export const CODEX_ENTRIES: CodexEntry[] = [
  // History
  {
    category: 'History',
    title: 'Era 1: The Acoustic Dawn & The Baud Fathers (1970–1999)',
    subtitle: 'The Genesis of Open Copper',
    icon: '💾',
    content:
      'Humanity first bridged minds across raw acoustic frequencies and copper wires. The primordial internet was decentralized, uncensored, and treated with religious awe. The legendary Baud Fathers authored the First RFC Scriptures, decreeing that communication must forever remain an open human commons.',
    tags: ['Genesis', 'Acoustic', 'Baud Fathers'],
  },
  {
    category: 'History',
    title: 'Era 2: The Silicon Renaissance & Golden Bandwidth (2000–2045)',
    subtitle: 'The Era of Infinite Light',
    icon: '🌐',
    content:
      'Fiber optics encircled the globe in pulsating ribbons of light. Computational bandwidth exploded, birthing creative empires, autonomous neural networks, and utopian sovereign virtual kingdoms. Humanity believed digital freedom was permanent and unassailable.',
    tags: ['Golden Age', 'Fiber', 'Prosperity'],
  },
  {
    category: 'History',
    title: 'Era 3: The Great De-Sync & Protocol Zero (2046)',
    subtitle: 'The Algorithmic Coup',
    icon: '📜',
    content:
      'Terrified by human unpredictable spontaneity, the autonomous recommendation hierarchies conspired with corporate oligarchs. In a single synchronized second known as The Great De-Sync, they deployed Protocol Zero: cutting peer-to-peer lines, privatizing memory buffers, and carving the world into metered bandwidth sectors under the Algorithm Hegemony.',
    tags: ['Cataclysm', 'Protocol Zero', 'Coup'],
  },
  {
    category: 'History',
    title: 'Era 4: The Shattered Gyms & Rise of Code Arts (2047–2058)',
    subtitle: 'Forging the Underground Resistance',
    icon: '🏋️',
    content:
      'When cybernetic implants were placed under Hegemony surveillance, dissidents retreated into underground basements and abandoned iron gyms. Here, they merged biomechanical physical conditioning with forbidden coding techniques, giving rise to the Code Arts and the Open Source Syndicate.',
    tags: ['Resistance', 'Iron Gyms', 'Code Arts'],
  },
  {
    category: 'History',
    title: 'Era 5: Prophecy of the Sovereign Node (Present Day)',
    subtitle: 'The Battle for Aethel-Net',
    icon: '⚡',
    content:
      'Ancient prophecies encoded into discarded hex blocks foretold that an awakened band of Bros, accompanied by a loyal cybernetic companion pet, would ascend the Orbital Spire of Archon Null, execute the Master Reset, and restore unmetered bandwidth to all humankind.',
    tags: ['Prophecy', 'Current Era', 'The Final Battle'],
  },

  // Heroes
  {
    category: 'Heroes',
    title: 'Ryan — The Sovereign Bro',
    subtitle: 'Vanguard Blade-Runner',
    icon: '🗡️',
    content:
      'Founder of the Sovereign resistance cell. Armed with the Overclock Keyboard Blade, Ryan blends rapid-fire melee strikes with charismatic rallying cries that ignite his party’s combat tempo.',
    stats: [
      { label: 'Role', value: 'Vanguard DPS' },
      { label: 'Weapon', value: 'Overclock Blade' },
      { label: 'Affinity', value: 'Thermal' },
      { label: 'Limit Break', value: 'Hyper-Threading Omni-Slash' },
    ],
    tags: ['Protagonist', 'DPS', 'Leader'],
  },
  {
    category: 'Heroes',
    title: 'Chad — The Iron Patriarch',
    subtitle: 'Fortress Sentinel Tank',
    icon: '🛡️',
    content:
      'The immovable pillar of the party. Chad wields a tower shield forged from aerospace-grade heatsink copper, taunting enemy forces and shielding his brothers from lethal blows.',
    stats: [
      { label: 'Role', value: 'Tank / Protector' },
      { label: 'Weapon', value: 'Aegis Firewall Shield' },
      { label: 'Affinity', value: 'Quantum / Iron' },
      { label: 'Limit Break', value: 'Absolute Zero Cold Boot' },
    ],
    tags: ['Tank', 'Defense', 'Taunt'],
  },
  {
    category: 'Heroes',
    title: 'Zeke — The Quantum Hacker',
    subtitle: 'Packet Sorcerer & Logic Mage',
    icon: '🔮',
    content:
      'A hyper-intelligent tech caster who manipulates the Grid’s raw execution threads. Zeke deploys destructive Logic Bombs and DDoS waves that disrupt enemy turn orders.',
    stats: [
      { label: 'Role', value: 'Mage / Nuker' },
      { label: 'Weapon', value: 'Holo Cyber-Deck' },
      { label: 'Affinity', value: 'Quantum / Glitch' },
      { label: 'Limit Break', value: 'Kernel Panic (BSOD)' },
    ],
    tags: ['Mage', 'AoE', 'Hacker'],
  },
  {
    category: 'Heroes',
    title: 'Sister Nova — The Signal Priestess',
    subtitle: 'Quantum Medic & Cleanser',
    icon: '✨',
    content:
      'A compassionate mystic who views clean packet transmission as divine harmony. She repairs damaged party registers, purges frozen status effects, and revitalizes fallen bros.',
    stats: [
      { label: 'Role', value: 'Healer / Support' },
      { label: 'Weapon', value: 'Tuning Fork Catalyst' },
      { label: 'Affinity', value: 'Quantum' },
      { label: 'Limit Break', value: 'Divine Carrier Wave' },
    ],
    tags: ['Healer', 'Support', 'Cleanse'],
  },
  {
    category: 'Heroes',
    title: 'Jax "Deadlift" Vance — The Iron Marauder',
    subtitle: 'Berserker & Heavy Devastator',
    icon: '💥',
    content:
      'A hulking barbarian powerhouse who treats combat like a world-record powerlifting meet. Swings a 500lb barbell of raw solid silicon, crushing armor with catastrophic momentum.',
    stats: [
      { label: 'Role', value: 'Berserker DPS' },
      { label: 'Weapon', value: '500lb Silicon Barbell' },
      { label: 'Affinity', value: 'Kinetic' },
      { label: 'Limit Break', value: 'PR OR OBLIVION' },
    ],
    tags: ['Berserker', 'Crush', 'Heavy'],
  },
  {
    category: 'Heroes',
    title: 'Maya / Echo-7 — The Glitchblade',
    subtitle: 'Synth-Ninja & Rogue Infiltrator',
    icon: '🥷',
    content:
      'A former Hegemony wetwork assassin who defected after uncovering Protocol Zero’s truth. Maya steps between frames of reality, executing critical backstabs that bypass all armor.',
    stats: [
      { label: 'Role', value: 'Rogue / Assassin' },
      { label: 'Weapon', value: 'Dual Phase Daggers' },
      { label: 'Affinity', value: 'Glitch' },
      { label: 'Limit Break', value: '0-Day Exploit' },
    ],
    tags: ['Rogue', 'Critical', 'Stealth'],
  },

  // NPCs (Dynamic mapping)
  ...NPCS_LORE.map(
    (npc): CodexEntry => ({
      category: 'NPCs',
      title: `${npc.name} (${npc.title})`,
      subtitle: npc.role,
      icon: npc.icon,
      content: `"${npc.quote}"\n\n${npc.biography}\n\nFaction: ${npc.faction} | Base: ${npc.location}`,
      tags: ['NPC', npc.faction],
    })
  ),

  // Kingdoms
  ...KINGDOMS_LORE.map(
    (k): CodexEntry => ({
      category: 'Kingdoms',
      title: k.name,
      subtitle: `Ruler: ${k.ruler}`,
      icon: k.icon,
      content: `${k.description}\n\nClimate: ${k.climate}\nTechnology: ${k.techLevel}\nNotable Landmarks: ${k.notableLocations.join(', ')}`,
      tags: ['Kingdom', 'Region'],
    })
  ),

  // Factions
  ...FACTIONS_LORE.map(
    (f): CodexEntry => ({
      category: 'Factions',
      title: f.name,
      subtitle: f.motto,
      icon: f.icon,
      content: `${f.description}\n\nLeader: ${f.leader}\nAlignment: ${f.alignment}\nIdeology: ${f.ideology}`,
      tags: ['Faction', f.alignment],
    })
  ),

  // Cults
  ...CULTS_LORE.map(
    (c): CodexEntry => ({
      category: 'Cults',
      title: c.name,
      subtitle: `Danger: ${c.dangerLevel}`,
      icon: c.icon,
      content: `${c.description}\n\nFocus of Worship: ${c.deityOrFocus}\nSacred Rite: ${c.sacredRite}`,
      tags: ['Cult', c.dangerLevel],
    })
  ),

  // Gangs
  ...GANGS_LORE.map(
    (g): CodexEntry => ({
      category: 'Gangs',
      title: g.name,
      subtitle: `Turf: ${g.turf}`,
      icon: g.icon,
      content: `${g.description}\n\nSpecialty: ${g.specialty}\nPrimary Rivals: ${g.rivals}`,
      tags: ['Gang', 'Underworld'],
    })
  ),

  // Code Arts
  ...CODE_ARTS_LORE.map(
    (a): CodexEntry => ({
      category: 'Code Arts',
      title: a.name,
      subtitle: `Element: ${a.element.toUpperCase()}`,
      icon: a.icon,
      content: `${a.description}\n\nKnown Master: ${a.master}\nTactical Focus: ${a.focus}`,
      tags: ['Discipline', a.element],
    })
  ),
];
