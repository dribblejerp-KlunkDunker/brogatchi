import type { PetType } from '../../../store';

export interface RPGSkill {
  id: string;
  name: string;
  mpCost: number;
  description: string;
  targetType: 'enemy_single' | 'enemy_all' | 'ally_single' | 'ally_all';
  damageMultiplier?: number;
  healMultiplier?: number;
  statusEffect?: 'stun' | 'firewall' | 'overheat' | 'regen';
  element?: 'kinetic' | 'thermal' | 'cryo' | 'quantum' | 'glitch';
}

export interface RPGItem {
  id: string;
  name: string;
  count: number;
  icon: string;
  description: string;
  targetType: 'ally_single' | 'ally_all';
  healHp?: number;
  healMp?: number;
  revive?: boolean;
}

export interface RPGRelic {
  id: string;
  name: string;
  icon: string;
  tier: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  description: string;
  bonusHp?: number;
  bonusMp?: number;
  bonusAtk?: number;
  bonusDef?: number;
  bonusSpd?: number;
  passiveDesc: string;
}

export interface ScrapMaterial {
  id: string;
  name: string;
  icon: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  description: string;
}

export const SCRAP_MATERIALS: Record<string, ScrapMaterial> = {
  germanium_transistor: {
    id: 'germanium_transistor',
    name: 'Germanium Transistor',
    icon: '🧲',
    rarity: 'Legendary',
    description: 'Ancestral solid-state switch preserved from the pre-cloud era. Used in legendary relics.',
  },
  cracked_heatsink: {
    id: 'cracked_heatsink',
    name: 'Cracked Copper Fin',
    icon: '🧊',
    rarity: 'Common',
    description: 'Salvaged cooling fin from scorched mainframe racks. Basic defense component.',
  },
  overclock_quartz: {
    id: 'overclock_quartz',
    name: 'Overclock Quartz Diode',
    icon: '⚡',
    rarity: 'Rare',
    description: 'Piezoelectric crystal that pulses with erratic high-frequency clock signals.',
  },
  quantum_nanotube: {
    id: 'quantum_nanotube',
    name: 'Quantum Nanotube Filament',
    icon: '🔮',
    rarity: 'Epic',
    description: 'Superconducting carbon thread woven with entangled state memory.',
  },
  solder_flux: {
    id: 'solder_flux',
    name: 'Conductive Solder Paste',
    icon: '🔥',
    rarity: 'Common',
    description: 'High-temp rosin core flux paste for bonding shattered silicon circuits.',
  },
};

export interface RelicForgeRecipe {
  id: string;
  resultRelicId: string;
  name: string;
  tier: 'Mk.I' | 'Mk.II' | 'Mk.III';
  description: string;
  materials: { materialId: string; count: number }[];
  coinCost: number;
}

export interface HeroTalent {
  id: string;
  name: string;
  tier: 1 | 2;
  spec: 'specA' | 'specB';
  specName: string;
  icon: string;
  description: string;
  costCP: number;
  statBonus?: {
    hp?: number;
    mp?: number;
    atk?: number;
    def?: number;
    spd?: number;
    critRate?: number;
  };
  perkText: string;
}

export interface HeroProgression {
  level: number;
  exp: number;
  maxExp: number;
  cp: number;
  unlockedTalentIds: string[];
}

export const HERO_TALENT_TREES: Record<string, HeroTalent[]> = {
  ryan: [
    {
      id: 'ryan_t1_a',
      name: 'Silicon Edge',
      tier: 1,
      spec: 'specA',
      specName: 'Overclock Samurai',
      icon: '🗡️',
      description: 'Hones blade thermals for sharper critical slicing.',
      costCP: 1,
      statBonus: { atk: 8, critRate: 0.05 },
      perkText: '+8 ATK, +5% Crit Rate',
    },
    {
      id: 'ryan_t2_a',
      name: 'Thermal Velocity',
      tier: 2,
      spec: 'specA',
      specName: 'Overclock Samurai',
      icon: '⚡',
      description: 'Overclocks limb servos to slice faster than enemy clock cycles.',
      costCP: 2,
      statBonus: { spd: 0.6, atk: 12 },
      perkText: '+0.6 ATB Speed, +12 ATK',
    },
    {
      id: 'ryan_t1_b',
      name: 'Bandwidth Rally',
      tier: 1,
      spec: 'specB',
      specName: 'Tactical Warlord',
      icon: '📢',
      description: 'Amplifies squad morale and memory register pools.',
      costCP: 1,
      statBonus: { mp: 30, hp: 35 },
      perkText: '+30 Max MP, +35 Max HP',
    },
    {
      id: 'ryan_t2_b',
      name: 'Sovereign Aegis',
      tier: 2,
      spec: 'specB',
      specName: 'Tactical Warlord',
      icon: '🛡️',
      description: 'Radiates an unshakeable sovereign field protecting all bros.',
      costCP: 2,
      statBonus: { def: 8, hp: 50 },
      perkText: '+8 DEF, +50 Max HP',
    },
  ],
  chad: [
    {
      id: 'chad_t1_a',
      name: 'Hardened Silicon',
      tier: 1,
      spec: 'specA',
      specName: 'Fortress Bulwark',
      icon: '🧱',
      description: 'Reinforces armor plating with compressed ceramic silicon.',
      costCP: 1,
      statBonus: { hp: 70, def: 8 },
      perkText: '+70 Max HP, +8 DEF',
    },
    {
      id: 'chad_t2_a',
      name: 'Kinetic Rebound',
      tier: 2,
      spec: 'specA',
      specName: 'Fortress Bulwark',
      icon: '💥',
      description: 'Absorbs heavy kinetic blows and converts them into defensive shielding.',
      costCP: 2,
      statBonus: { hp: 100, def: 12 },
      perkText: '+100 Max HP, +12 DEF',
    },
    {
      id: 'chad_t1_b',
      name: 'Heavy Momentum',
      tier: 1,
      spec: 'specB',
      specName: 'Battering Ram',
      icon: '🔨',
      description: 'Adds raw iron mass behind shield bashes.',
      costCP: 1,
      statBonus: { atk: 14, critRate: 0.04 },
      perkText: '+14 ATK, +4% Crit Rate',
    },
    {
      id: 'chad_t2_b',
      name: 'Seismic Breaker',
      tier: 2,
      spec: 'specB',
      specName: 'Battering Ram',
      icon: '🌋',
      description: 'Crushes enemy defenses with hydraulic shield rams.',
      costCP: 2,
      statBonus: { atk: 20, def: 6 },
      perkText: '+20 ATK, +6 DEF',
    },
  ],
  zeke: [
    {
      id: 'zeke_t1_a',
      name: 'Code De-Sync',
      tier: 1,
      spec: 'specA',
      specName: 'Bug Inflictor',
      icon: '🐛',
      description: 'Injects micro-delays into enemy instruction pipelines.',
      costCP: 1,
      statBonus: { spd: 0.5, mp: 35 },
      perkText: '+0.5 Speed, +35 Max MP',
    },
    {
      id: 'zeke_t2_a',
      name: 'Zero-Day Breach',
      tier: 2,
      spec: 'specA',
      specName: 'Bug Inflictor',
      icon: '☣️',
      description: 'Glitch exploits rip through target armor registers.',
      costCP: 2,
      statBonus: { atk: 18, critRate: 0.08 },
      perkText: '+18 ATK, +8% Crit Rate',
    },
    {
      id: 'zeke_t1_b',
      name: 'Overclocked ALU',
      tier: 1,
      spec: 'specB',
      specName: 'Raw Hex Nuker',
      icon: '🔮',
      description: 'Supercharges computational logic units for devastating magic.',
      costCP: 1,
      statBonus: { atk: 16, mp: 40 },
      perkText: '+16 ATK, +40 Max MP',
    },
    {
      id: 'zeke_t2_b',
      name: 'Kernel Annihilation',
      tier: 2,
      spec: 'specB',
      specName: 'Raw Hex Nuker',
      icon: '☄️',
      description: 'Massive floating point arithmetic overload vaporizes memory.',
      costCP: 2,
      statBonus: { atk: 24, mp: 60 },
      perkText: '+24 ATK, +60 Max MP',
    },
  ],
  nova: [
    {
      id: 'nova_t1_a',
      name: 'Harmonic Carrier',
      tier: 1,
      spec: 'specA',
      specName: 'Carrier Wave Oracle',
      icon: '🌊',
      description: 'Expands the wavelength of restorative protocol packets.',
      costCP: 1,
      statBonus: { mp: 45, hp: 40 },
      perkText: '+45 Max MP, +40 Max HP',
    },
    {
      id: 'nova_t2_a',
      name: 'Aura of Renewal',
      tier: 2,
      spec: 'specA',
      specName: 'Carrier Wave Oracle',
      icon: '✨',
      description: 'Continuous quantum regeneration flows through all allies.',
      costCP: 2,
      statBonus: { hp: 80, def: 8 },
      perkText: '+80 Max HP, +8 DEF',
    },
    {
      id: 'nova_t1_b',
      name: 'High-Frequency Smite',
      tier: 1,
      spec: 'specB',
      specName: 'Signal Disrupter',
      icon: '⚡',
      description: 'Refocuses healing frequencies into focused laser strikes.',
      costCP: 1,
      statBonus: { atk: 14, critRate: 0.06 },
      perkText: '+14 ATK, +6% Crit Rate',
    },
    {
      id: 'nova_t2_b',
      name: 'Latency Purge',
      tier: 2,
      spec: 'specB',
      specName: 'Signal Disrupter',
      icon: '☀️',
      description: 'Disrupts enemy clock cycles with blinding quantum flares.',
      costCP: 2,
      statBonus: { atk: 20, spd: 0.5 },
      perkText: '+20 ATK, +0.5 Speed',
    },
  ],
  jax: [
    {
      id: 'jax_t1_a',
      name: 'PR Adrenaline',
      tier: 1,
      spec: 'specA',
      specName: 'PR Juggernaut',
      icon: '🏋️',
      description: 'Muscle memory turns battlefield pain into kinetic rage.',
      costCP: 1,
      statBonus: { atk: 15, hp: 50 },
      perkText: '+15 ATK, +50 Max HP',
    },
    {
      id: 'jax_t2_a',
      name: 'Heavy Iron Core',
      tier: 2,
      spec: 'specA',
      specName: 'PR Juggernaut',
      icon: '🏆',
      description: '500lb barbell inertia pierces all enemy defenses.',
      costCP: 2,
      statBonus: { atk: 25, critRate: 0.08 },
      perkText: '+25 ATK, +8% Crit Rate',
    },
    {
      id: 'jax_t1_b',
      name: 'Seismic Stomp',
      tier: 1,
      spec: 'specB',
      specName: 'Silicon Breaker',
      icon: '🦶',
      description: 'Heels strike the grid floor, generating stagger shockwaves.',
      costCP: 1,
      statBonus: { def: 10, hp: 60 },
      perkText: '+10 DEF, +60 Max HP',
    },
    {
      id: 'jax_t2_b',
      name: 'Titanium Sinews',
      tier: 2,
      spec: 'specB',
      specName: 'Silicon Breaker',
      icon: '🦾',
      description: 'Unbreakable biomechanical tendons absorb extreme punishment.',
      costCP: 2,
      statBonus: { hp: 120, def: 14 },
      perkText: '+120 Max HP, +14 DEF',
    },
  ],
  maya: [
    {
      id: 'maya_t1_a',
      name: 'Phase Step',
      tier: 1,
      spec: 'specA',
      specName: '0-Day Assassin',
      icon: '🗡️',
      description: 'Shifts between collision meshes to strike vulnerable ports.',
      costCP: 1,
      statBonus: { spd: 0.8, critRate: 0.08 },
      perkText: '+0.8 Speed, +8% Crit Rate',
    },
    {
      id: 'maya_t2_a',
      name: 'Fatal Exception',
      tier: 2,
      spec: 'specA',
      specName: '0-Day Assassin',
      icon: '💀',
      description: 'Exploits hardware faults for devastating critical strikes.',
      costCP: 2,
      statBonus: { atk: 22, critRate: 0.12 },
      perkText: '+22 ATK, +12% Crit Rate',
    },
    {
      id: 'maya_t1_b',
      name: 'Holographic Mirage',
      tier: 1,
      spec: 'specB',
      specName: 'Glitch Weaver',
      icon: '🌫️',
      description: 'Leaves false packet ghosts to confuse enemy targeting algorithms.',
      costCP: 1,
      statBonus: { def: 8, hp: 45 },
      perkText: '+8 DEF, +45 Max HP',
    },
    {
      id: 'maya_t2_b',
      name: 'Frame Skip',
      tier: 2,
      spec: 'specB',
      specName: 'Glitch Weaver',
      icon: '🌀',
      description: 'Skips rendering frames to instantly reposition behind threats.',
      costCP: 2,
      statBonus: { spd: 1.0, atk: 16 },
      perkText: '+1.0 Speed, +16 ATK',
    },
  ],
};

export interface DualTech {
  id: string;
  name: string;
  hero1Id: string;
  hero2Id: string;
  limitCost: number;
  mpCost: number;
  description: string;
  damageMultiplier: number;
  element: 'thermal' | 'cryo' | 'quantum' | 'glitch' | 'kinetic';
  targetType: 'enemy_single' | 'enemy_all' | 'ally_all';
  buffEffect?: 'firewall' | 'regen' | 'overheat' | 'stun';
}

export interface RPGHero {
  id: string;
  name: string;
  title: string;
  role: 'Vanguard' | 'Tank' | 'Mage' | 'Healer' | 'Berserker' | 'Rogue';
  maxHp: number;
  hp: number;
  maxMp: number;
  mp: number;
  atk: number;
  def: number;
  spd: number;
  critRate: number; // 0 to 1
  atb: number; // 0 to 100
  limit: number; // 0 to 100
  color: string;
  skills: RPGSkill[];
  limitName: string;
  limitDesc: string;
  dead: boolean;
  isGuarding: boolean;
  status?: string;
  statusTurns?: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  actionTimer: number;
  equippedRelicId?: string;
  level?: number;
  exp?: number;
  maxExp?: number;
  cp?: number;
  unlockedTalentIds?: string[];
}

export const RPG_RELICS: RPGRelic[] = [
  // Mk.I Base Relics
  {
    id: 'titanium_heatsink',
    name: 'Titanium Heatsink',
    icon: '🧊',
    tier: 'Common',
    bonusDef: 8,
    bonusHp: 40,
    description: 'Aircraft-grade anodized copper fins dissipate incoming thermal shock.',
    passiveDesc: '+40 Max HP, +8 DEF',
  },
  {
    id: 'titanium_heatsink_mk2',
    name: 'Cryo-Mesh Heatsink Mk.II',
    icon: '🧊✨',
    tier: 'Rare',
    bonusDef: 16,
    bonusHp: 80,
    description: 'Vapor chamber heatpipes forged from refined scrap aluminum.',
    passiveDesc: '+80 Max HP, +16 DEF',
  },
  {
    id: 'overclock_crystal',
    name: 'Overclock Resonator',
    icon: '⚡',
    tier: 'Rare',
    bonusAtk: 12,
    bonusSpd: 0.6,
    description: 'High-frequency quartz oscillator boosting clock speeds beyond factory specs.',
    passiveDesc: '+12 ATK, +0.6 ATB Speed',
  },
  {
    id: 'overclock_crystal_mk2',
    name: 'Supercharged Resonator Mk.II',
    icon: '⚡🔥',
    tier: 'Epic',
    bonusAtk: 24,
    bonusSpd: 1.1,
    description: 'Precision-tuned quartz lattice soaked in conductive solder paste.',
    passiveDesc: '+24 ATK, +1.1 ATB Speed',
  },
  {
    id: 'quantum_core',
    name: 'Entangled Quantum Core',
    icon: '🔮',
    tier: 'Epic',
    bonusMp: 45,
    bonusAtk: 16,
    description: 'Microscopic singularity generating limitless probabilistic computational energy.',
    passiveDesc: '+45 Max MP, +16 ATK',
  },
  {
    id: 'quantum_core_mk2',
    name: 'Superposed Singularity Mk.II',
    icon: '🔮🌌',
    tier: 'Legendary',
    bonusMp: 80,
    bonusAtk: 28,
    description: 'Entangled carbon nanotubes stabilize probabilistic state collapse.',
    passiveDesc: '+80 Max MP, +28 ATK',
  },
  {
    id: 'baud_father_pendant',
    name: 'Baud Father Pendant',
    icon: '💾',
    tier: 'Legendary',
    bonusHp: 75,
    bonusDef: 12,
    bonusSpd: 0.8,
    description: 'Ancestral germanium medallion blessed with the primordial open protocols.',
    passiveDesc: '+75 Max HP, +12 DEF, +0.8 Speed',
  },
  {
    id: 'baud_father_pendant_mk2',
    name: 'Prime Protocol Reliquary Mk.II',
    icon: '💾👑',
    tier: 'Legendary',
    bonusHp: 130,
    bonusDef: 20,
    bonusSpd: 1.2,
    description: 'Imbued with ancestral germanium transistors and unbroken baud seeds.',
    passiveDesc: '+130 Max HP, +20 DEF, +1.2 Speed',
  },
  {
    id: 'pr_shaker_bottle',
    name: 'Golden Shaker of Swoleheim',
    icon: '🏆',
    tier: 'Epic',
    bonusHp: 60,
    bonusAtk: 14,
    description: 'Charged with holy electrolytes that ignite kinetic muscle memory.',
    passiveDesc: '+60 Max HP, +14 ATK',
  },
  {
    id: 'pr_shaker_bottle_mk2',
    name: 'Swoleheim PR Chalice Mk.II',
    icon: '🏆⚡',
    tier: 'Legendary',
    bonusHp: 110,
    bonusAtk: 26,
    description: 'Double-insulated shaker cup packed with supercritical electrolytes.',
    passiveDesc: '+110 Max HP, +26 ATK',
  },
  {
    id: 'zeroday_needle',
    name: '0-Day Exploit Needle',
    icon: '💉',
    tier: 'Rare',
    bonusAtk: 10,
    bonusSpd: 0.9,
    description: 'Bypasses hardware parity checks to strike with lightning agility.',
    passiveDesc: '+10 ATK, +0.9 ATB Speed',
  },
  {
    id: 'zeroday_needle_mk2',
    name: 'Kernel Bypass Needle Mk.II',
    icon: '💉☣️',
    tier: 'Epic',
    bonusAtk: 20,
    bonusSpd: 1.5,
    description: 'Micro-laser honed exploit needle bypassing all memory protections.',
    passiveDesc: '+20 ATK, +1.5 ATB Speed',
  },
];

export const RELIC_FORGE_RECIPES: RelicForgeRecipe[] = [
  {
    id: 'forge_heatsink_mk2',
    resultRelicId: 'titanium_heatsink_mk2',
    name: 'Cryo-Mesh Heatsink Mk.II',
    tier: 'Mk.II',
    description: 'Upgrade Titanium Heatsink into a multi-chamber sub-zero defense mesh.',
    materials: [
      { materialId: 'cracked_heatsink', count: 3 },
      { materialId: 'solder_flux', count: 2 },
    ],
    coinCost: 150,
  },
  {
    id: 'forge_overclock_mk2',
    resultRelicId: 'overclock_crystal_mk2',
    name: 'Supercharged Resonator Mk.II',
    tier: 'Mk.II',
    description: 'Fuse high-purity quartz with conductive paste for extreme ATB velocity.',
    materials: [
      { materialId: 'overclock_quartz', count: 3 },
      { materialId: 'solder_flux', count: 2 },
    ],
    coinCost: 200,
  },
  {
    id: 'forge_quantum_mk2',
    resultRelicId: 'quantum_core_mk2',
    name: 'Superposed Singularity Mk.II',
    tier: 'Mk.II',
    description: 'Weave entangled nanotubes into the core for limitless computational magic.',
    materials: [
      { materialId: 'quantum_nanotube', count: 3 },
      { materialId: 'overclock_quartz', count: 2 },
    ],
    coinCost: 300,
  },
  {
    id: 'forge_baud_mk2',
    resultRelicId: 'baud_father_pendant_mk2',
    name: 'Prime Protocol Reliquary Mk.II',
    tier: 'Mk.II',
    description: 'Masterwork relic forged from ancestral germanium transistors and pure flux.',
    materials: [
      { materialId: 'germanium_transistor', count: 2 },
      { materialId: 'quantum_nanotube', count: 2 },
      { materialId: 'solder_flux', count: 3 },
    ],
    coinCost: 450,
  },
  {
    id: 'forge_shaker_mk2',
    resultRelicId: 'pr_shaker_bottle_mk2',
    name: 'Swoleheim PR Chalice Mk.II',
    tier: 'Mk.II',
    description: 'Reinforce the holy shaker with thermal heatsinks and heavy solder.',
    materials: [
      { materialId: 'cracked_heatsink', count: 4 },
      { materialId: 'solder_flux', count: 3 },
    ],
    coinCost: 250,
  },
  {
    id: 'forge_zeroday_mk2',
    resultRelicId: 'zeroday_needle_mk2',
    name: 'Kernel Bypass Needle Mk.II',
    tier: 'Mk.II',
    description: 'Hone needle tip with quantum filaments for instant hardware interrupts.',
    materials: [
      { materialId: 'quantum_nanotube', count: 2 },
      { materialId: 'overclock_quartz', count: 3 },
    ],
    coinCost: 250,
  },
];

export const ALL_PLAYABLE_HEROES: Record<string, Omit<RPGHero, 'x' | 'y' | 'startX' | 'startY' | 'actionTimer' | 'dead' | 'isGuarding' | 'atb' | 'limit'>> = {
  ryan: {
    id: 'ryan',
    name: 'Ryan',
    title: 'Sovereign Bro',
    role: 'Vanguard',
    maxHp: 200,
    hp: 200,
    maxMp: 60,
    mp: 60,
    atk: 38,
    def: 10,
    spd: 3.2,
    critRate: 0.14,
    color: '#38bdf8',
    skills: [
      {
        id: 'overclock_strike',
        name: 'Overclock Slash',
        mpCost: 12,
        description: 'Strikes with a blazing thermal keyboard blade.',
        targetType: 'enemy_single',
        damageMultiplier: 1.65,
        element: 'thermal',
      },
      {
        id: 'rally_bros',
        name: 'Rallying Cry',
        mpCost: 18,
        description: 'Rallies the squad, boosting team attack power and ATB tempo.',
        targetType: 'ally_all',
        healMultiplier: 0.2,
      },
      {
        id: 'blade_flurry',
        name: 'Neon Blade Flurry',
        mpCost: 22,
        description: 'Unleashes three consecutive thermal slashes.',
        targetType: 'enemy_single',
        damageMultiplier: 2.1,
        element: 'thermal',
      },
    ],
    limitName: 'HYPER-THREADING OMNI-SLASH',
    limitDesc: '8 rhythmic neon slashes striking all enemies simultaneously!',
  },
  chad: {
    id: 'chad',
    name: 'Chad',
    title: 'Iron Patriarch',
    role: 'Tank',
    maxHp: 280,
    hp: 280,
    maxMp: 45,
    mp: 45,
    atk: 22,
    def: 22,
    spd: 1.8,
    critRate: 0.05,
    color: '#eab308',
    skills: [
      {
        id: 'taunt_bastion',
        name: 'Iron Taunt',
        mpCost: 10,
        description: 'Forces all enemy attacks onto Chad while raising defense.',
        targetType: 'ally_single',
        statusEffect: 'firewall',
      },
      {
        id: 'shield_bash',
        name: 'Shield Slam',
        mpCost: 14,
        description: 'Heavy blunt kinetic slam with a chance to Stun.',
        targetType: 'enemy_single',
        damageMultiplier: 1.35,
        statusEffect: 'stun',
        element: 'kinetic',
      },
      {
        id: 'fortress_wall',
        name: 'Kinetic Barrier',
        mpCost: 20,
        description: 'Deploys a shock-absorbing light mesh protecting the party.',
        targetType: 'ally_all',
        statusEffect: 'firewall',
      },
    ],
    limitName: 'ABSOLUTE ZERO COLD BOOT',
    limitDesc: 'Deploys an impenetrable firewall absorbing all damage and reflecting it!',
  },
  zeke: {
    id: 'zeke',
    name: 'Zeke',
    title: 'Quantum Hacker',
    role: 'Mage',
    maxHp: 135,
    hp: 135,
    maxMp: 100,
    mp: 100,
    atk: 52,
    def: 5,
    spd: 2.7,
    critRate: 0.22,
    color: '#a855f7',
    skills: [
      {
        id: 'logic_bomb',
        name: 'Logic Bomb',
        mpCost: 18,
        description: 'Injects an explosive data virus dealing massive quantum damage.',
        targetType: 'enemy_single',
        damageMultiplier: 2.25,
        element: 'quantum',
      },
      {
        id: 'ddos_wave',
        name: 'DDoS Wave',
        mpCost: 26,
        description: 'Floods all enemies with packet noise, lowering enemy ATB gauges.',
        targetType: 'enemy_all',
        damageMultiplier: 1.45,
        element: 'glitch',
      },
      {
        id: 'buffer_overflow',
        name: 'Buffer Overflow',
        mpCost: 22,
        description: 'Corrupts enemy memory addresses, applying damage-over-time.',
        targetType: 'enemy_single',
        damageMultiplier: 1.8,
        element: 'glitch',
      },
    ],
    limitName: 'KERNEL PANIC (BSOD)',
    limitDesc: 'Trashes the enemy subsystem with unrecoverable blue screen corruption!',
  },
  nova: {
    id: 'nova',
    name: 'Sister Nova',
    title: 'Signal Priestess',
    role: 'Healer',
    maxHp: 160,
    hp: 160,
    maxMp: 90,
    mp: 90,
    atk: 26,
    def: 10,
    spd: 2.8,
    critRate: 0.1,
    color: '#34d399',
    skills: [
      {
        id: 'packet_restore',
        name: 'Packet Restore',
        mpCost: 15,
        description: 'Restores 120 HP and cleanses negative status from an ally.',
        targetType: 'ally_single',
        healMultiplier: 2.0,
      },
      {
        id: 'latency_purge',
        name: 'Latency Purge',
        mpCost: 24,
        description: 'Heals the entire party and restores 20 ATB charge.',
        targetType: 'ally_all',
        healMultiplier: 1.3,
      },
      {
        id: 'tachyon_aegis',
        name: 'Tachyon Aegis',
        mpCost: 20,
        description: 'Infuses an ally with regenerative quantum shielding.',
        targetType: 'ally_single',
        statusEffect: 'regen',
      },
    ],
    limitName: 'DIVINE CARRIER WAVE',
    limitDesc: 'Reboots fallen allies to 100% HP and infuses the squad with full MP regeneration!',
  },
  jax: {
    id: 'jax',
    name: 'Jax "Deadlift"',
    title: 'Iron Marauder',
    role: 'Berserker',
    maxHp: 240,
    hp: 240,
    maxMp: 40,
    mp: 40,
    atk: 56,
    def: 12,
    spd: 2.0,
    critRate: 0.2,
    color: '#f59e0b',
    skills: [
      {
        id: 'heavy_cleave',
        name: 'Heavy Cleave',
        mpCost: 12,
        description: 'Swings a 500lb silicon barbell, cleaving for bone-crushing impact.',
        targetType: 'enemy_single',
        damageMultiplier: 1.85,
        element: 'kinetic',
      },
      {
        id: 'deadlift_tremor',
        name: 'Deadlift Tremor',
        mpCost: 22,
        description: 'Slams the ground with seismic force, damaging and staggering all foes.',
        targetType: 'enemy_all',
        damageMultiplier: 1.35,
        element: 'kinetic',
      },
      {
        id: 'iron_rage',
        name: 'Iron Rage',
        mpCost: 16,
        description: 'Channels pure testosterone and adrenaline, doubling critical rate.',
        targetType: 'ally_single',
        statusEffect: 'overheat',
      },
    ],
    limitName: 'PR OR OBLIVION',
    limitDesc: 'A colossal 500lb silicon smash delivering 4.5x devastating true damage!',
  },
  maya: {
    id: 'maya',
    name: 'Maya (Echo-7)',
    title: 'The Glitchblade',
    role: 'Rogue',
    maxHp: 155,
    hp: 155,
    maxMp: 65,
    mp: 65,
    atk: 46,
    def: 7,
    spd: 4.2,
    critRate: 0.35,
    color: '#f43f5e',
    skills: [
      {
        id: 'frame_skip',
        name: 'Frame Skip',
        mpCost: 14,
        description: 'Teleports between display frames, delivering an armor-piercing backstab.',
        targetType: 'enemy_single',
        damageMultiplier: 1.9,
        element: 'glitch',
      },
      {
        id: 'desync_stride',
        name: 'Desync Stride',
        mpCost: 18,
        description: 'Gains 100% evasion for 2 turns and readies an immediate counter-attack.',
        targetType: 'ally_single',
      },
      {
        id: 'poison_byte',
        name: 'Poison Byte',
        mpCost: 16,
        description: 'Strikes with venom-coded daggers that corrode enemy defenses.',
        targetType: 'enemy_single',
        damageMultiplier: 1.5,
        element: 'glitch',
      },
    ],
    limitName: '0-DAY EXPLOIT',
    limitDesc: 'Instantaneous multi-frame critical assassination piercing 100% enemy defense!',
  },
};

export function createParty(
  pet: PetType,
  selectedHeroIds: string[] = ['ryan', 'chad', 'zeke'],
  progressionMap?: Record<string, HeroProgression>
): RPGHero[] {
  // 1. Companion Pet Guardian (Always present as party leader / familiar)
  const petAuraNames: Record<PetType, { name: string; title: string; skill: string; limit: string }> = {
    cyber_dog: {
      name: 'Cyber K-9',
      title: 'Satellite Scout',
      skill: 'Radar Ping',
      limit: 'ORBITAL LASER UPLINK',
    },
    neko_cat: {
      name: 'Neko Cat',
      title: 'Lucky Infiltrator',
      skill: 'Claw Flurry',
      limit: 'NYA~ 9-LIVES BARRAGE',
    },
    pixel_dragon: {
      name: 'Pixel Drake',
      title: 'Emerald Inferno',
      skill: 'Flame Breath',
      limit: 'MEGABYTE DRAGON BREATH',
    },
    tactical_frog: {
      name: 'Ops Frog',
      title: 'Spec-Ops Scout',
      skill: 'Camo Ambush',
      limit: 'AIRBORNE TACTICAL STRIKE',
    },
    alien_xeno: {
      name: 'Cosmic Xeno',
      title: 'Quantum Anomaly',
      skill: 'Tachyon Pulse',
      limit: 'SINGULARITY COLLAPSE',
    },
    spooky_ghost: {
      name: 'Boo Ghost',
      title: 'Spectral Phantom',
      skill: 'Phase Chill',
      limit: 'ETHEREAL POLTERGEIST',
    },
    ryan: {
      name: 'Lil Ryan',
      title: 'Sovereign Mascot',
      skill: 'Hype Boost',
      limit: 'RGB POWER SURGE',
    },
  };

  const petInfo = petAuraNames[pet] || petAuraNames.ryan;

  const heroGuardian: RPGHero = {
    id: 'guardian',
    name: petInfo.name,
    title: petInfo.title,
    role: 'Vanguard',
    maxHp: 180,
    hp: 180,
    maxMp: 70,
    mp: 70,
    atk: 36,
    def: 10,
    spd: 3.8,
    critRate: 0.18,
    atb: 35,
    limit: 0,
    color: '#06b6d4',
    skills: [
      {
        id: 'guardian_skill',
        name: petInfo.skill,
        mpCost: 15,
        description: 'Channels companion energy to deal elemental burst damage.',
        targetType: 'enemy_single',
        damageMultiplier: 1.85,
        element: 'quantum',
      },
      {
        id: 'hype_cheer',
        name: 'Squad Cheer',
        mpCost: 20,
        description: 'Boosts team speed and refills 20 ATB to all allies.',
        targetType: 'ally_all',
      },
    ],
    limitName: petInfo.limit,
    limitDesc: 'Cinematic companion ultimate dealing 3.8x critical defense-piercing damage!',
    dead: false,
    isGuarding: false,
    x: 65,
    y: 260,
    startX: 65,
    startY: 260,
    actionTimer: 0,
    level: 1,
    exp: 0,
    maxExp: 100,
    cp: 0,
    unlockedTalentIds: [],
  };

  // 2. Map selected 3 heroes with fixed battle slot coordinates
  const slotPositions = [
    { x: 100, y: 330 },
    { x: 55, y: 400 },
    { x: 95, y: 470 },
  ];

  // Guarantee exactly 3 valid heroes
  const activeHeroIds = (selectedHeroIds.length >= 3 ? selectedHeroIds.slice(0, 3) : ['ryan', 'chad', 'zeke']);

  const heroes: RPGHero[] = activeHeroIds.map((heroId, index) => {
    const template = ALL_PLAYABLE_HEROES[heroId] || ALL_PLAYABLE_HEROES.ryan;
    const pos = slotPositions[index] || { x: 75, y: 350 + index * 60 };
    const prog = progressionMap?.[heroId] || {
      level: 1,
      exp: 0,
      maxExp: 100,
      cp: 0,
      unlockedTalentIds: [],
    };

    let heroObj: RPGHero = {
      ...template,
      dead: false,
      isGuarding: false,
      atb: 15 + index * 10,
      limit: 0,
      x: pos.x,
      y: pos.y,
      startX: pos.x,
      startY: pos.y,
      actionTimer: 0,
      level: prog.level,
      exp: prog.exp,
      maxExp: prog.maxExp,
      cp: prog.cp,
      unlockedTalentIds: prog.unlockedTalentIds,
    };

    // Apply level stat scaling (+6% per level above 1)
    if (prog.level > 1) {
      const bonusPct = (prog.level - 1) * 0.06;
      heroObj.maxHp = Math.floor(heroObj.maxHp * (1 + bonusPct));
      heroObj.hp = heroObj.maxHp;
      heroObj.maxMp = Math.floor(heroObj.maxMp * (1 + bonusPct));
      heroObj.mp = heroObj.maxMp;
      heroObj.atk = Math.floor(heroObj.atk * (1 + bonusPct));
      heroObj.def = Math.floor(heroObj.def * (1 + bonusPct));
    }

    // Apply unlocked talent bonuses
    const heroTalents = HERO_TALENT_TREES[heroId] || [];
    prog.unlockedTalentIds.forEach((tId) => {
      const talent = heroTalents.find((t) => t.id === tId);
      if (talent && talent.statBonus) {
        if (talent.statBonus.hp) {
          heroObj.maxHp += talent.statBonus.hp;
          heroObj.hp = heroObj.maxHp;
        }
        if (talent.statBonus.mp) {
          heroObj.maxMp += talent.statBonus.mp;
          heroObj.mp = heroObj.maxMp;
        }
        if (talent.statBonus.atk) heroObj.atk += talent.statBonus.atk;
        if (talent.statBonus.def) heroObj.def += talent.statBonus.def;
        if (talent.statBonus.spd) heroObj.spd += talent.statBonus.spd;
        if (talent.statBonus.critRate) heroObj.critRate += talent.statBonus.critRate;
      }
    });

    return heroObj;
  });

  return [heroGuardian, ...heroes];
}

export function calculateLevelUp(currentExp: number, currentLevel: number, currentMaxExp: number): {
  newLevel: number;
  newExp: number;
  newMaxExp: number;
  gainedLevels: number;
  gainedCP: number;
} {
  let lvl = currentLevel;
  let exp = currentExp;
  let maxExp = currentMaxExp;
  let gainedLevels = 0;
  let gainedCP = 0;

  while (exp >= maxExp && lvl < 20) {
    exp -= maxExp;
    lvl += 1;
    maxExp = Math.floor(maxExp * 1.35);
    gainedLevels += 1;
    gainedCP += 1;
  }

  return { newLevel: lvl, newExp: exp, newMaxExp: maxExp, gainedLevels, gainedCP };
}

export function canForgeRecipe(
  recipe: RelicForgeRecipe,
  scrapInventory: Record<string, number>,
  currentCoins: number
): boolean {
  if (currentCoins < recipe.coinCost) return false;
  return recipe.materials.every((req) => (scrapInventory[req.materialId] || 0) >= req.count);
}

export const INITIAL_ITEMS: RPGItem[] = [
  {
    id: 'soda',
    name: 'G-Fuel Soda',
    count: 4,
    icon: '🥤',
    description: 'Restores 85 HP to one ally.',
    targetType: 'ally_single',
    healHp: 85,
  },
  {
    id: 'battery',
    name: 'Overclock Battery',
    count: 3,
    icon: '🔋',
    description: 'Restores 45 MP to one ally.',
    targetType: 'ally_single',
    healMp: 45,
  },
  {
    id: 'coolant',
    name: 'Liquid Coolant Flask',
    count: 2,
    icon: '🧊',
    description: 'Restores 120 HP to all allies.',
    targetType: 'ally_all',
    healHp: 120,
  },
  {
    id: 'repair_kit',
    name: 'System Restore USB',
    count: 2,
    icon: '💾',
    description: 'Revives a fallen ally with 60% HP.',
    targetType: 'ally_single',
    revive: true,
  },
];

export const ALL_DUAL_TECHS: DualTech[] = [
  {
    id: 'firewall_cleave',
    name: 'Firewall Cleave',
    hero1Id: 'ryan',
    hero2Id: 'chad',
    limitCost: 40,
    mpCost: 20,
    description: 'Ryan overclocks his blade behind Chad’s firewall, releasing an explosive thermal/kinetic blast that shields the party.',
    damageMultiplier: 2.8,
    element: 'thermal',
    targetType: 'enemy_all',
    buffEffect: 'firewall',
  },
  {
    id: 'zeroday_ddos',
    name: '0-Day DDoS Wave',
    hero1Id: 'zeke',
    hero2Id: 'maya',
    limitCost: 45,
    mpCost: 25,
    description: 'Zeke floods enemy memory addresses while Maya phase-stabs the core, piercing 50% defense and staggering enemies.',
    damageMultiplier: 3.2,
    element: 'glitch',
    targetType: 'enemy_single',
  },
  {
    id: 'anabolic_resuscitation',
    name: 'Anabolic Resuscitation',
    hero1Id: 'jax',
    hero2Id: 'nova',
    limitCost: 40,
    mpCost: 22,
    description: 'Jax slams the ground with seismic momentum while Sister Nova bathes the party in a restorative quantum carrier wave.',
    damageMultiplier: 2.4,
    element: 'kinetic',
    targetType: 'enemy_all',
    buffEffect: 'regen',
  },
  {
    id: 'quantum_overclock',
    name: 'Quantum Overclock',
    hero1Id: 'ryan',
    hero2Id: 'zeke',
    limitCost: 40,
    mpCost: 24,
    description: 'Ryan and Zeke weave thermal blades with quantum logic bombs for rapid-fire armor shattering.',
    damageMultiplier: 2.9,
    element: 'quantum',
    targetType: 'enemy_single',
  },
  {
    id: 'iron_fortress_tremor',
    name: 'Iron Fortress Tremor',
    hero1Id: 'chad',
    hero2Id: 'jax',
    limitCost: 45,
    mpCost: 22,
    description: 'Chad and Jax smash their tower shield and 500lb barbell together, generating a seismic shockwave that stuns all foes.',
    damageMultiplier: 2.5,
    element: 'kinetic',
    targetType: 'enemy_all',
    buffEffect: 'stun',
  },
  {
    id: 'phase_restoration',
    name: 'Phase Restoration',
    hero1Id: 'nova',
    hero2Id: 'maya',
    limitCost: 35,
    mpCost: 20,
    description: 'Nova purges all negative status while Maya distracts foes with deceptive holographic frame skips.',
    damageMultiplier: 2.2,
    element: 'glitch',
    targetType: 'ally_all',
    buffEffect: 'regen',
  },
];

export function getAvailableDualTechs(partyHeroIds: string[]): DualTech[] {
  return ALL_DUAL_TECHS.filter(
    (dt) => partyHeroIds.includes(dt.hero1Id) && partyHeroIds.includes(dt.hero2Id)
  );
}

