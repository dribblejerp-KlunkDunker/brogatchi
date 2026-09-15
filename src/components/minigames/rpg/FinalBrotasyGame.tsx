import { useState, useEffect, useRef, useCallback } from 'react';
import type { PetType } from '../../../store';
import { drawPixelPet, type Particle, type FloatingText } from '../types';
import {
  RPG_SECTORS,
  CODEX_ENTRIES,
  ROGUE_BOUNTIES,
  type SectorInfo,
  type SectorNode,
  type SectorNodeBranch,
  type CodexCategory,
  type RogueBounty,
} from './loreData';
import {
  createParty,
  INITIAL_ITEMS,
  ALL_PLAYABLE_HEROES,
  RPG_RELICS,
  ALL_DUAL_TECHS,
  getAvailableDualTechs,
  SCRAP_MATERIALS,
  RELIC_FORGE_RECIPES,
  HERO_TALENT_TREES,
  calculateLevelUp,
  canForgeRecipe,
  type RPGHero,
  type RPGSkill,
  type RPGItem,
  type RPGRelic,
  type DualTech,
  type HeroProgression,
  type RelicForgeRecipe,
} from './characters';
import { getEnemiesForSector, getBountyEnemy, BESTIARY_DATA, type RPGEnemy } from './enemies';
import { audio } from '../../../audio';
import { synthwaveBGM } from './synthwaveAudio';

interface FinalBrotasyGameProps {
  pet: PetType;
  onClose: (earnedCoins: number) => void;
}

type ViewMode =
  | 'sectors'
  | 'dungeon_map'
  | 'battle'
  | 'dialogue'
  | 'npc_dialogue'
  | 'codex'
  | 'squad'
  | 'talents'
  | 'forge'
  | 'bounties'
  | 'oracle';

export function FinalBrotasyGame({ pet, onClose }: FinalBrotasyGameProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('sectors');
  const [selectedSector, setSelectedSector] = useState<SectorInfo>(RPG_SECTORS[0]);
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0);
  const [clearedNodeIds, setClearedNodeIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('brotasy_cleared_nodes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [clearedSectorIds, setClearedSectorIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('brotasy_cleared_sectors');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeNpcNode, setActiveNpcNode] = useState<SectorNode | null>(null);

  const [codexCategory, setCodexCategory] = useState<CodexCategory>('History');
  const [codexSearch, setCodexSearch] = useState('');
  const [bgmEnabled, setBgmEnabled] = useState(false);

  // Party & Custom Squad State (persisted)
  const [selectedHeroIds, setSelectedHeroIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('brotasy_squad_heroes');
      return saved ? JSON.parse(saved) : ['ryan', 'chad', 'zeke'];
    } catch {
      return ['ryan', 'chad', 'zeke'];
    }
  });
  const [heroRelicMap, setHeroRelicMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('brotasy_hero_relics');
      return saved
        ? JSON.parse(saved)
        : {
            ryan: 'overclock_crystal',
            chad: 'titanium_heatsink',
            zeke: 'quantum_core',
          };
    } catch {
      return {
        ryan: 'overclock_crystal',
        chad: 'titanium_heatsink',
        zeke: 'quantum_core',
      };
    }
  });

  // Hero Progression & Code Points State (persisted)
  const [heroProgressionMap, setHeroProgressionMap] = useState<Record<string, HeroProgression>>(() => {
    try {
      const saved = localStorage.getItem('brotasy_hero_progression');
      return saved
        ? JSON.parse(saved)
        : {
            ryan: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
            chad: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
            zeke: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
            nova: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
            jax: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
            maya: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
          };
    } catch {
      return {
        ryan: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
        chad: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
        zeke: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
        nova: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
        jax: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
        maya: { level: 1, exp: 0, maxExp: 100, cp: 1, unlockedTalentIds: [] },
      };
    }
  });

  // Scrap Materials Inventory (persisted)
  const [scrapInventory, setScrapInventory] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('brotasy_scrap_inventory');
      return saved
        ? JSON.parse(saved)
        : {
            cracked_heatsink: 4,
            solder_flux: 3,
            overclock_quartz: 2,
            quantum_nanotube: 1,
            germanium_transistor: 0,
          };
    } catch {
      return {
        cracked_heatsink: 4,
        solder_flux: 3,
        overclock_quartz: 2,
        quantum_nanotube: 1,
        germanium_transistor: 0,
      };
    }
  });

  // Rogue Bounties State (persisted)
  const [clearedBountyIds, setClearedBountyIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('brotasy_cleared_bounties');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeBountyId, setActiveBountyId] = useState<string | null>(null);

  // Talents View State
  const [selectedTalentHeroId, setSelectedTalentHeroId] = useState<string>('ryan');

  // Oracle Riddle State
  const [oracleRiddleSolved, setOracleRiddleSolved] = useState(false);
  const [oracleError, setOracleError] = useState<string | null>(null);

  // Forge state
  const [forgeSuccessMessage, setForgeSuccessMessage] = useState<string | null>(null);

  // Loot & Level up notification records
  const [lastLootDrops, setLastLootDrops] = useState<{ materialId: string; name: string; count: number }[]>([]);
  const [lastLevelUps, setLastLevelUps] = useState<string[]>([]);

  const [party, setParty] = useState<RPGHero[]>(() => createParty(pet, selectedHeroIds, heroProgressionMap));
  const [enemies, setEnemies] = useState<RPGEnemy[]>([]);
  const [items, setItems] = useState<RPGItem[]>(INITIAL_ITEMS);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('brotasy_cleared_nodes', JSON.stringify(clearedNodeIds));
    } catch { /* ignore */ }
  }, [clearedNodeIds]);

  useEffect(() => {
    try {
      localStorage.setItem('brotasy_cleared_sectors', JSON.stringify(clearedSectorIds));
    } catch { /* ignore */ }
  }, [clearedSectorIds]);

  useEffect(() => {
    try {
      localStorage.setItem('brotasy_squad_heroes', JSON.stringify(selectedHeroIds));
    } catch { /* ignore */ }
  }, [selectedHeroIds]);

  useEffect(() => {
    try {
      localStorage.setItem('brotasy_hero_relics', JSON.stringify(heroRelicMap));
    } catch { /* ignore */ }
  }, [heroRelicMap]);

  useEffect(() => {
    try {
      localStorage.setItem('brotasy_hero_progression', JSON.stringify(heroProgressionMap));
    } catch { /* ignore */ }
  }, [heroProgressionMap]);

  useEffect(() => {
    try {
      localStorage.setItem('brotasy_scrap_inventory', JSON.stringify(scrapInventory));
    } catch { /* ignore */ }
  }, [scrapInventory]);

  useEffect(() => {
    try {
      localStorage.setItem('brotasy_cleared_bounties', JSON.stringify(clearedBountyIds));
    } catch { /* ignore */ }
  }, [clearedBountyIds]);

  // Story Dialogue State
  const [dialogueIndex, setDialogueIndex] = useState(0);

  // Combat State
  const [activeHeroId, setActiveHeroId] = useState<string | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<RPGSkill | null>(null);
  const [selectedDualTech, setSelectedDualTech] = useState<DualTech | null>(null);
  const [combatPhase, setCombatPhase] = useState<'active' | 'victory' | 'defeat'>('active');
  const [earnedCoinsTotal, setEarnedCoinsTotal] = useState(0);
  const [bossTelegraph, setBossTelegraph] = useState<string | null>(null);

  // Canvas & Visual FX refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatersRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef<number>(0);
  const tickCountRef = useRef<number>(0);

  // Re-sync party when pet, squad, progression, or relic changes
  useEffect(() => {
    const freshParty = createParty(pet, selectedHeroIds, heroProgressionMap);
    freshParty.forEach((h) => {
      const relicId = heroRelicMap[h.id];
      if (relicId) {
        const relic = RPG_RELICS.find((r) => r.id === relicId);
        if (relic) {
          h.equippedRelicId = relic.id;
          h.maxHp += relic.bonusHp || 0;
          h.hp = h.maxHp;
          h.maxMp += relic.bonusMp || 0;
          h.mp = h.maxMp;
          h.atk += relic.bonusAtk || 0;
          h.def += relic.bonusDef || 0;
          h.spd += relic.bonusSpd || 0;
        }
      }
    });
    setParty(freshParty);
  }, [pet, selectedHeroIds, heroRelicMap, heroProgressionMap]);

  // Clean up BGM on unmount
  useEffect(() => {
    return () => {
      synthwaveBGM.stopBGM();
    };
  }, []);

  const toggleBGM = () => {
    if (bgmEnabled) {
      synthwaveBGM.stopBGM();
      setBgmEnabled(false);
    } else {
      synthwaveBGM.startBGM(selectedSector.difficulty === 'LETHAL' || selectedSector.difficulty === 'NIGHTMARE');
      setBgmEnabled(true);
    }
  };

  // Sound triggering helper
  const playSound = useCallback((type: string) => {
    switch (type) {
      case 'slash': audio.playSlash(); break;
      case 'explosion': audio.playExplosion(); break;
      case 'laser': audio.playLaser(); break;
      case 'powerup': audio.playPowerup(); break;
      case 'hit': audio.playHit(); break;
      case 'coin': audio.playCoin(); break;
      case 'levelup': audio.playLevelUp(); break;
      default: audio.playBeep(); break;
    }
  }, []);

  // Start Sector Mission (Opens Dungeon Map)
  const startSector = (sector: SectorInfo) => {
    audio.playCoin();
    setSelectedSector(sector);
    setCurrentNodeIndex(0);
    setClearedNodeIds([]);
    setDialogueIndex(0);
    setActiveBountyId(null);

    const freshParty = createParty(pet, selectedHeroIds, heroProgressionMap);
    freshParty.forEach((h) => {
      const relicId = heroRelicMap[h.id];
      if (relicId) {
        const relic = RPG_RELICS.find((r) => r.id === relicId);
        if (relic) {
          h.equippedRelicId = relic.id;
          h.maxHp += relic.bonusHp || 0;
          h.hp = h.maxHp;
          h.maxMp += relic.bonusMp || 0;
          h.mp = h.maxMp;
          h.atk += relic.bonusAtk || 0;
          h.def += relic.bonusDef || 0;
          h.spd += relic.bonusSpd || 0;
        }
      }
    });
    setParty(freshParty);

    if (sector.storyIntro && sector.storyIntro.length > 0) {
      setViewMode('dialogue');
    } else {
      setViewMode('dungeon_map');
    }
  };

  // Launch a specific node within the sector
  const launchNode = (node: SectorNode, index: number) => {
    audio.playBeep();
    setCurrentNodeIndex(index);
    setActiveBountyId(null);

    if (node.type === 'npc_hub') {
      setActiveNpcNode(node);
      setViewMode('npc_dialogue');
      setParty((prev) => prev.map((h) => ({ ...h, hp: h.maxHp, mp: h.maxMp, dead: false })));
      playSound('powerup');
    } else if (node.type === 'forge') {
      setActiveNpcNode(node);
      setForgeSuccessMessage(null);
      setViewMode('forge');
      playSound('powerup');
    } else if (node.type === 'oracle') {
      setActiveNpcNode(node);
      setOracleRiddleSolved(false);
      setOracleError(null);
      setViewMode('oracle');
      playSound('powerup');
    } else if (node.type === 'secret_cache') {
      playSound('levelup');
      const bonusCoins = node.rewardCoins || 45;
      setEarnedCoinsTotal((prev) => prev + bonusCoins);
      setScrapInventory((prev) => ({
        ...prev,
        overclock_quartz: (prev.overclock_quartz || 0) + 1,
        cracked_heatsink: (prev.cracked_heatsink || 0) + 2,
      }));
      if (!clearedNodeIds.includes(node.id)) {
        setClearedNodeIds((prev) => [...prev, node.id]);
      }
      setActiveNpcNode(node);
      setViewMode('npc_dialogue');
    } else if (node.type === 'hazard') {
      setEnemies(getEnemiesForSector(selectedSector.id));
      setCombatPhase('active');
      setBossTelegraph(`⚠️ ENVIRONMENTAL HAZARD ACTIVE: ${node.hazardEffect || 'Extreme Grid Turbulence'}`);
      setViewMode('battle');
    } else {
      // Normal combat or Boss node
      const isBossNode = node.type === 'boss';
      const sectorEnemies = getEnemiesForSector(selectedSector.id);
      setEnemies(isBossNode ? sectorEnemies.filter((e) => e.isBoss) : sectorEnemies.filter((e) => !e.isBoss));
      setCombatPhase('active');
      setBossTelegraph(null);
      if (isBossNode) synthwaveBGM.setEnraged(true);
      setViewMode('battle');
    }
  };

  // Launch Rogue Bounty Boss Fight
  const launchBounty = (bounty: RogueBounty) => {
    audio.playBeep();
    setActiveBountyId(bounty.id);
    const bountyEnemies = getBountyEnemy(bounty.id);
    setEnemies(bountyEnemies);
    setCombatPhase('active');
    setBossTelegraph(`⚠️ ROGUE BOUNTY CLASH: ${bounty.name.toUpperCase()} (${bounty.difficulty})`);
    synthwaveBGM.setEnraged(true);
    setViewMode('battle');
  };

  // Select Branch Route
  const selectBranchRoute = (branch: SectorNodeBranch) => {
    audio.playBeep();
    if (branch.bonusRewardCoins) {
      setEarnedCoinsTotal((prev) => prev + branch.bonusRewardCoins!);
    }
    const targetIdx = selectedSector.nodes.findIndex((n) => n.id === branch.targetNodeId);
    if (targetIdx !== -1) {
      const targetNode = selectedSector.nodes[targetIdx];
      launchNode(targetNode, targetIdx);
    }
  };

  // Handle Talent Unlock
  const handleUnlockTalent = (heroId: string, talentId: string, cpCost: number) => {
    const currentProg = heroProgressionMap[heroId] || { level: 1, exp: 0, maxExp: 100, cp: 0, unlockedTalentIds: [] };
    if (currentProg.cp < cpCost) {
      audio.playTone(200, 'sawtooth', 0.2, 0.5);
      return;
    }
    if (currentProg.unlockedTalentIds.includes(talentId)) return;

    audio.playLevelUp();
    const updatedProg: HeroProgression = {
      ...currentProg,
      cp: currentProg.cp - cpCost,
      unlockedTalentIds: [...currentProg.unlockedTalentIds, talentId],
    };
    const updatedMap = {
      ...heroProgressionMap,
      [heroId]: updatedProg,
    };
    setHeroProgressionMap(updatedMap);
    setParty(createParty(pet, selectedHeroIds, updatedMap));
  };

  // Handle Relic Forge
  const handleForgeRecipe = (recipe: RelicForgeRecipe) => {
    if (!canForgeRecipe(recipe, scrapInventory, earnedCoinsTotal)) {
      audio.playTone(200, 'sawtooth', 0.2, 0.5);
      return;
    }

    audio.playPowerup();
    const updatedInventory = { ...scrapInventory };
    recipe.materials.forEach((req) => {
      updatedInventory[req.materialId] = Math.max(0, (updatedInventory[req.materialId] || 0) - req.count);
    });
    setScrapInventory(updatedInventory);
    if (recipe.coinCost > 0) {
      setEarnedCoinsTotal((prev) => Math.max(0, prev - recipe.coinCost));
    }

    // Auto-equip or link upgraded relic to matching heroes
    setHeroRelicMap((prev) => {
      const updated = { ...prev };
      for (const [hId, relId] of Object.entries(updated)) {
        if (relId === recipe.baseRelicId) {
          updated[hId] = recipe.id;
        }
      }
      return updated;
    });

    setForgeSuccessMessage(`FORGED: ${recipe.name}! Mk.II upgrades now active.`);
    setTimeout(() => setForgeSuccessMessage(null), 3500);
  };

  // Handle Oracle Riddle Solving
  const handleSolveOracle = (isCorrect: boolean) => {
    if (isCorrect) {
      audio.playLevelUp();
      setOracleRiddleSolved(true);
      setOracleError(null);
      setScrapInventory((prev) => ({
        ...prev,
        quantum_nanotube: (prev.quantum_nanotube || 0) + 2,
        germanium_transistor: (prev.germanium_transistor || 0) + 2,
        overclock_quartz: (prev.overclock_quartz || 0) + 2,
      }));
      setEarnedCoinsTotal((prev) => prev + 150);
      if (activeNpcNode && !clearedNodeIds.includes(activeNpcNode.id)) {
        setClearedNodeIds((prev) => [...prev, activeNpcNode.id]);
      }
    } else {
      audio.playTone(180, 'sawtooth', 0.25, 0.6);
      setOracleError('ERROR 0x404: Hex checksum invalid! Signal degraded. Try another protocol.');
    }
  };

  // Advance dialogue
  const advanceDialogue = () => {
    audio.playBeep();
    if (dialogueIndex + 1 < selectedSector.storyIntro.length) {
      setDialogueIndex((prev) => prev + 1);
    } else {
      setViewMode('dungeon_map');
    }
  };

  // Elemental advantage calculation helper
  const calculateElementalEffect = (attackElem?: string, targetElem?: string) => {
    if (!attackElem || !targetElem) return { mult: 1.0, label: '' };
    if (attackElem === 'thermal' && targetElem === 'cryo') return { mult: 1.35, label: 'WEAK! x1.35' };
    if (attackElem === 'cryo' && targetElem === 'thermal') return { mult: 1.35, label: 'WEAK! x1.35' };
    if (attackElem === 'kinetic' && targetElem === 'glitch') return { mult: 1.25, label: 'WEAK! x1.25' };
    if (attackElem === 'quantum' && targetElem === 'glitch') return { mult: 1.35, label: 'WEAK! x1.35' };
    if (attackElem === 'glitch' && targetElem === 'quantum') return { mult: 1.4, label: 'WEAK! x1.40' };
    if (attackElem === 'thermal' && targetElem === 'quantum') return { mult: 0.75, label: 'RESIST! x0.75' };
    if (attackElem === 'cryo' && targetElem === 'kinetic') return { mult: 0.75, label: 'RESIST! x0.75' };
    return { mult: 1.0, label: '' };
  };

  // Main 60Hz Combat Loop
  useEffect(() => {
    if (viewMode !== 'battle' || combatPhase !== 'active') return;

    let animId: number;
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      tickCountRef.current++;
      if (screenShakeRef.current > 0) screenShakeRef.current -= 0.5;

      // 1. Advance ATB gauges
      setParty((prevParty) =>
        prevParty.map((hero) => {
          if (hero.dead || hero.actionTimer > 0) return hero;
          if (hero.atb < 100) {
            const nextAtb = Math.min(100, hero.atb + hero.spd * 0.45 * dt * 60);
            return { ...hero, atb: nextAtb };
          }
          return hero;
        })
      );

      setEnemies((prevEnemies) =>
        prevEnemies.map((enemy) => {
          if (enemy.dead || enemy.actionTimer > 0) return enemy;
          if (enemy.atb < 100) {
            const nextAtb = Math.min(100, enemy.atb + enemy.spd * 0.42 * dt * 60);
            return { ...enemy, atb: nextAtb };
          }
          return enemy;
        })
      );

      // 2. Process Enemy AI Turns (when enemy ATB reaches 100)
      setEnemies((currentEnemies) => {
        const readyEnemy = currentEnemies.find((e) => !e.dead && e.atb >= 100 && e.actionTimer === 0);
        if (readyEnemy) {
          executeEnemyTurn(readyEnemy);
        }
        return currentEnemies;
      });

      // 3. Render Canvas
      renderCanvas();

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [viewMode, combatPhase]);

  // Execute Enemy Turn
  const executeEnemyTurn = (enemy: RPGEnemy) => {
    setParty((currentParty) => {
      const livingHeroes = currentParty.filter((h) => !h.dead);
      if (livingHeroes.length === 0) return currentParty;

      // Boss telegraph
      if (enemy.isBoss && !enemy.bossCharge) {
        if (Math.random() < 0.45) {
          enemy.bossCharge = 2;
          setBossTelegraph(`⚠️ ${enemy.name.toUpperCase()} IS CHARGING CODE WIPEOUT (2 TURNS) - GUARD OR STUN NOW!`);
          playSound('laser');
          return currentParty;
        }
      }

      let isBossBlast = false;
      if (enemy.isBoss && enemy.bossCharge) {
        enemy.bossCharge -= 1;
        if (enemy.bossCharge <= 0) {
          isBossBlast = true;
          setBossTelegraph(null);
        } else {
          setBossTelegraph(`⚠️ ${enemy.name.toUpperCase()} POWER CHARGING: 1 TURN REMAINING!`);
          return currentParty;
        }
      }

      // Tank draws aggro
      const tauntingHero = livingHeroes.find((h) => h.status === 'firewall');
      const targetHero = tauntingHero || livingHeroes[Math.floor(Math.random() * livingHeroes.length)];

      const baseRaw = enemy.atk + Math.floor(Math.random() * 8);
      const rawDmg = isBossBlast ? Math.floor(baseRaw * 2.2) : Math.max(4, baseRaw);
      const defMitigation = targetHero.isGuarding ? targetHero.def * 1.6 : targetHero.def * 0.6;
      const finalDmg = Math.max(2, Math.floor(rawDmg - defMitigation));

      playSound(isBossBlast ? 'explosion' : enemy.isBoss ? 'explosion' : 'hit');
      screenShakeRef.current = isBossBlast ? 14 : enemy.isBoss ? 8 : 4;

      floatersRef.current.push({
        x: targetHero.x + 15,
        y: targetHero.y - 15,
        text: isBossBlast ? `BLAST! -${finalDmg}` : `-${finalDmg}`,
        color: '#ef4444',
        life: 1.3,
        maxLife: 1.3,
        vy: -1.2,
        fontSize: isBossBlast ? 16 : 14,
        isCrit: isBossBlast,
      });

      for (let p = 0; p < (isBossBlast ? 18 : 6); p++) {
        particlesRef.current.push({
          x: targetHero.x + 15,
          y: targetHero.y + 20,
          vx: (Math.random() - 0.5) * (isBossBlast ? 14 : 8),
          vy: (Math.random() - 0.5) * (isBossBlast ? 14 : 8),
          life: 0.8,
          maxLife: 0.8,
          color: isBossBlast ? '#f43f5e' : enemy.color,
          size: 3,
          type: 'spark',
        });
      }

      const updatedParty = currentParty.map((h) => {
        if (h.id === targetHero.id) {
          const nextHp = Math.max(0, h.hp - finalDmg);
          const nextLimit = Math.min(100, h.limit + (isBossBlast ? 40 : 20));
          return {
            ...h,
            hp: nextHp,
            dead: nextHp === 0,
            limit: nextLimit,
            isGuarding: false,
          };
        }
        return h;
      });

      if (updatedParty.every((h) => h.dead)) {
        setCombatPhase('defeat');
        playSound('hit');
      }

      return updatedParty;
    });

    setEnemies((prev) =>
      prev.map((e) => (e.id === enemy.id ? { ...e, atb: 0, actionTimer: 20 } : e))
    );
  };

  const readyHeroes = party.filter((h) => !h.dead && h.atb >= 100);
  const activeHero = activeHeroId
    ? party.find((h) => h.id === activeHeroId)
    : readyHeroes[0] || null;

  const livingEnemies = enemies.filter((e) => !e.dead);
  const currentTarget = selectedTargetId
    ? livingEnemies.find((e) => e.id === selectedTargetId) || livingEnemies[0]
    : livingEnemies[0] || null;

  // Available Dual Techs for currently selected squad
  const availableDualTechs = getAvailableDualTechs(selectedHeroIds);

  // --- COMBAT ACTIONS ---

  // 1. Basic Attack
  const handleHeroAttack = () => {
    if (!activeHero || !currentTarget) return;

    playSound('slash');
    screenShakeRef.current = 4;

    const elemEffect = calculateElementalEffect(activeHero.skills[0]?.element, currentTarget.element);
    const isCrit = Math.random() < activeHero.critRate;
    const baseDmg = Math.max(4, activeHero.atk + Math.floor(Math.random() * 8));
    const critMult = isCrit ? 1.65 : 1.0;
    const finalDmg = Math.max(2, Math.floor(((baseDmg * critMult) - (currentTarget.def * 0.45)) * elemEffect.mult));

    if (elemEffect.label) {
      floatersRef.current.push({
        x: currentTarget.x + 10,
        y: currentTarget.y - 35,
        text: elemEffect.label,
        color: elemEffect.mult > 1 ? '#38bdf8' : '#94a3b8',
        life: 1.4,
        maxLife: 1.4,
        vy: -1.0,
        fontSize: 12,
      });
    }

    floatersRef.current.push({
      x: currentTarget.x + 15,
      y: currentTarget.y - 18,
      text: isCrit ? `CRIT! -${finalDmg}` : `-${finalDmg}`,
      color: isCrit ? '#facc15' : '#ffffff',
      life: 1.2,
      maxLife: 1.2,
      vy: -1.2,
      fontSize: isCrit ? 16 : 13,
      isCrit,
    });

    for (let p = 0; p < (isCrit ? 14 : 7); p++) {
      particlesRef.current.push({
        x: currentTarget.x + 15,
        y: currentTarget.y + 20,
        vx: (Math.random() - 0.5) * (isCrit ? 12 : 7),
        vy: (Math.random() - 0.5) * (isCrit ? 12 : 7),
        life: 0.8,
        maxLife: 0.8,
        color: isCrit ? '#facc15' : activeHero.color,
        size: 3,
        type: 'spark',
      });
    }

    setEnemies((prev) => {
      const next = prev.map((e) => {
        if (e.id === currentTarget.id) {
          const nextHp = Math.max(0, e.hp - finalDmg);
          return { ...e, hp: nextHp, dead: nextHp === 0 };
        }
        return e;
      });
      if (next.every((e) => e.dead)) handleVictory();
      return next;
    });

    setParty((prev) =>
      prev.map((h) =>
        h.id === activeHero.id
          ? {
              ...h,
              atb: 0,
              mp: Math.min(h.maxMp, h.mp + 4),
              limit: Math.min(100, h.limit + 10),
              actionTimer: 25,
            }
          : h
      )
    );

    setActiveHeroId(null);
  };

  // 2. Cast Skill
  const handleHeroSkill = (skill: RPGSkill) => {
    if (!activeHero || activeHero.mp < skill.mpCost) {
      playSound('hit');
      return;
    }

    playSound(skill.element === 'cryo' ? 'laser' : 'powerup');
    screenShakeRef.current = 6;

    setParty((prev) =>
      prev.map((h) => (h.id === activeHero.id ? { ...h, mp: h.mp - skill.mpCost } : h))
    );

    if (skill.targetType === 'ally_all' || skill.targetType === 'ally_single') {
      const healAmt = Math.floor(activeHero.atk * (skill.healMultiplier || 1.4));
      setParty((prev) =>
        prev.map((h) => {
          if (skill.targetType === 'ally_all' || h.id === activeHero.id) {
            const nextHp = Math.min(h.maxHp, h.hp + healAmt);
            floatersRef.current.push({
              x: h.x + 10,
              y: h.y - 15,
              text: `+${healAmt} HP`,
              color: '#34d399',
              life: 1.2,
              maxLife: 1.2,
              vy: -1.0,
              fontSize: 13,
            });
            return {
              ...h,
              hp: nextHp,
              status: skill.statusEffect || h.status,
              statusTurns: skill.statusEffect ? 3 : h.statusTurns,
            };
          }
          return h;
        })
      );
    } else if (skill.targetType === 'enemy_all') {
      const targets = enemies.filter((e) => !e.dead);
      targets.forEach((target) => {
        const elemEffect = calculateElementalEffect(skill.element, target.element);
        const dmg = Math.max(6, Math.floor((activeHero.atk * (skill.damageMultiplier || 1.4) - target.def * 0.35) * elemEffect.mult));
        floatersRef.current.push({
          x: target.x + 15,
          y: target.y - 15,
          text: `-${dmg}`,
          color: '#c084fc',
          life: 1.2,
          maxLife: 1.2,
          vy: -1.2,
          fontSize: 14,
        });
      });

      setEnemies((prev) => {
        const next = prev.map((e) => {
          if (e.dead) return e;
          const elemEffect = calculateElementalEffect(skill.element, e.element);
          const dmg = Math.max(6, Math.floor((activeHero.atk * (skill.damageMultiplier || 1.4) - e.def * 0.35) * elemEffect.mult));
          const nextHp = Math.max(0, e.hp - dmg);
          return { ...e, hp: nextHp, dead: nextHp === 0 };
        });
        if (next.every((e) => e.dead)) handleVictory();
        return next;
      });
    } else if (currentTarget) {
      const elemEffect = calculateElementalEffect(skill.element, currentTarget.element);
      const dmg = Math.max(8, Math.floor((activeHero.atk * (skill.damageMultiplier || 1.8) - currentTarget.def * 0.35) * elemEffect.mult));

      if (elemEffect.label) {
        floatersRef.current.push({
          x: currentTarget.x + 10,
          y: currentTarget.y - 35,
          text: elemEffect.label,
          color: elemEffect.mult > 1 ? '#38bdf8' : '#94a3b8',
          life: 1.4,
          maxLife: 1.4,
          vy: -1.0,
          fontSize: 12,
        });
      }

      floatersRef.current.push({
        x: currentTarget.x + 15,
        y: currentTarget.y - 18,
        text: `-${dmg}`,
        color: '#f43f5e',
        life: 1.2,
        maxLife: 1.2,
        vy: -1.2,
        fontSize: 15,
      });

      setEnemies((prev) => {
        const next = prev.map((e) => {
          if (e.id === currentTarget.id) {
            const nextHp = Math.max(0, e.hp - dmg);
            return { ...e, hp: nextHp, dead: nextHp === 0 };
          }
          return e;
        });
        if (next.every((e) => e.dead)) handleVictory();
        return next;
      });
    }

    // Tactical ATB Delay Pushback on Cryo & DDoS skills
    if (skill.element === 'cryo' || skill.id === 'ddos_wave') {
      setEnemies((prev) =>
        prev.map((e) => {
          if (e.dead) return e;
          if (skill.targetType === 'enemy_all' || e.id === currentTarget?.id) {
            floatersRef.current.push({
              x: e.x + 10,
              y: e.y - 30,
              text: 'DELAYED! ⏳ -25 ATB',
              color: '#38bdf8',
              life: 1.4,
              maxLife: 1.4,
              vy: -1.0,
              fontSize: 12,
            });
            return { ...e, atb: Math.max(0, e.atb - 25) };
          }
          return e;
        })
      );
    }

    setParty((prev) =>
      prev.map((h) =>
        h.id === activeHero.id
          ? { ...h, atb: 0, limit: Math.min(100, h.limit + 15), actionTimer: 25 }
          : h
      )
    );

    setSelectedSkill(null);
    setActiveHeroId(null);
  };

  // 3. Execute Dual-Bro Synergy Attack (Dual Tech)
  const handleExecuteDualTech = (tech: DualTech) => {
    const hero1 = party.find((h) => h.id === tech.hero1Id);
    const hero2 = party.find((h) => h.id === tech.hero2Id);

    if (!hero1 || !hero2 || hero1.dead || hero2.dead) {
      playSound('hit');
      return;
    }
    if (hero1.limit < tech.limitCost || hero2.limit < tech.limitCost || hero1.mp < tech.mpCost || hero2.mp < tech.mpCost) {
      playSound('hit');
      return;
    }

    synthwaveBGM.playDualTechFanfare();
    screenShakeRef.current = 16;

    // Deduct resources
    setParty((prev) =>
      prev.map((h) => {
        if (h.id === tech.hero1Id || h.id === tech.hero2Id) {
          return {
            ...h,
            limit: Math.max(0, h.limit - tech.limitCost),
            mp: Math.max(0, h.mp - tech.mpCost),
            atb: 0,
            actionTimer: 35,
          };
        }
        return h;
      })
    );

    floatersRef.current.push({
      x: 70,
      y: 190,
      text: `DUAL TECH: ${tech.name}!`,
      color: '#facc15',
      life: 2.2,
      maxLife: 2.2,
      vy: -1.2,
      fontSize: 16,
      isCrit: true,
    });

    const combinedAtk = hero1.atk + hero2.atk;
    const dualDmg = Math.floor(combinedAtk * tech.damageMultiplier);

    if (tech.targetType === 'ally_all') {
      setParty((prev) =>
        prev.map((h) => ({
          ...h,
          hp: Math.min(h.maxHp, h.hp + 120),
          status: tech.buffEffect || h.status,
          statusTurns: 3,
        }))
      );
    } else {
      setEnemies((prev) => {
        const next = prev.map((e) => {
          if (e.dead) return e;
          const nextHp = Math.max(0, e.hp - dualDmg);
          floatersRef.current.push({
            x: e.x + 10,
            y: e.y - 20,
            text: `DUAL! -${dualDmg}`,
            color: '#facc15',
            life: 1.5,
            maxLife: 1.5,
            vy: -1.4,
            fontSize: 15,
            isCrit: true,
          });
          return { ...e, hp: nextHp, dead: nextHp === 0 };
        });
        if (next.every((e) => e.dead)) handleVictory();
        return next;
      });
    }

    if (tech.buffEffect === 'firewall') {
      setParty((prev) =>
        prev.map((h) => ({ ...h, status: 'firewall', statusTurns: 3 }))
      );
    }

    setSelectedDualTech(null);
    setActiveHeroId(null);
  };

  // 4. Guard
  const handleHeroDefend = () => {
    if (!activeHero) return;
    playSound('powerup');
    setParty((prev) =>
      prev.map((h) =>
        h.id === activeHero.id
          ? { ...h, isGuarding: true, atb: 0, mp: Math.min(h.maxMp, h.mp + 8), actionTimer: 15 }
          : h
      )
    );
    floatersRef.current.push({
      x: activeHero.x + 10,
      y: activeHero.y - 15,
      text: 'GUARDING!',
      color: '#38bdf8',
      life: 1.0,
      maxLife: 1.0,
      vy: -0.8,
      fontSize: 12,
    });
    setActiveHeroId(null);
  };

  // 5. Use Item
  const handleUseItem = (item: RPGItem) => {
    if (!activeHero || item.count <= 0) return;
    playSound('powerup');

    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, count: it.count - 1 } : it))
    );

    setParty((prev) =>
      prev.map((h) => {
        if (item.targetType === 'ally_all' || h.id === activeHero.id) {
          const nextHp = item.healHp ? Math.min(h.maxHp, h.hp + item.healHp) : h.hp;
          const nextMp = item.healMp ? Math.min(h.maxMp, h.mp + item.healMp) : h.mp;
          const revived = item.revive && h.dead ? Math.floor(h.maxHp * 0.6) : nextHp;
          return { ...h, hp: revived, mp: nextMp, dead: false };
        }
        return h;
      })
    );

    setParty((prev) =>
      prev.map((h) => (h.id === activeHero.id ? { ...h, atb: 0, actionTimer: 20 } : h))
    );

    setActiveHeroId(null);
  };

  // 6. Hero Limit Break
  const handleHeroLimitBreak = () => {
    if (!activeHero || activeHero.limit < 100) return;

    playSound('powerup');
    setTimeout(() => playSound('explosion'), 300);
    screenShakeRef.current = 14;

    floatersRef.current.push({
      x: 80,
      y: 200,
      text: activeHero.limitName,
      color: '#facc15',
      life: 2.0,
      maxLife: 2.0,
      vy: -1.0,
      fontSize: 16,
      isCrit: true,
    });

    const ultimateDmg = Math.floor(activeHero.atk * 3.8);

    setEnemies((prev) => {
      const next = prev.map((e) => {
        if (e.dead) return e;
        const nextHp = Math.max(0, e.hp - ultimateDmg);
        floatersRef.current.push({
          x: e.x + 10,
          y: e.y - 20,
          text: `ULT! -${ultimateDmg}`,
          color: '#facc15',
          life: 1.5,
          maxLife: 1.5,
          vy: -1.4,
          fontSize: 15,
          isCrit: true,
        });
        return { ...e, hp: nextHp, dead: nextHp === 0 };
      });
      if (next.every((e) => e.dead)) handleVictory();
      return next;
    });

    setParty((prev) =>
      prev.map((h) =>
        h.id === activeHero.id ? { ...h, limit: 0, atb: 0, actionTimer: 40 } : h
      )
    );

    setActiveHeroId(null);
  };

  // Victory Handler
  const handleVictory = () => {
    playSound('levelup');
    setCombatPhase('victory');
    const currentNode = selectedSector.nodes[currentNodeIndex];
    const baseBounty = (currentNode?.rewardCoins || 25) + (currentNode?.type === 'boss' ? selectedSector.rewardCoins : 0);
    let totalBounty = baseBounty;

    // 1. Roll for scrap material drops from all defeated enemies
    const lootList: { materialId: string; name: string; count: number }[] = [];
    enemies.forEach((e) => {
      if (e.scrapDrop && Math.random() <= e.scrapDrop.chance) {
        lootList.push({
          materialId: e.scrapDrop.materialId,
          name: e.scrapDrop.name,
          count: e.scrapDrop.count,
        });
        setScrapInventory((prev) => ({
          ...prev,
          [e.scrapDrop!.materialId]: (prev[e.scrapDrop!.materialId] || 0) + e.scrapDrop!.count,
        }));
      }
    });
    setLastLootDrops(lootList);

    // 2. Award Hero EXP & Level Ups (+1 CP per level)
    const gainedExp = 35 + (currentNode?.type === 'boss' || activeBountyId ? 65 : 0);
    const leveledHeroes: string[] = [];

    setHeroProgressionMap((prev) => {
      const next = { ...prev };
      selectedHeroIds.forEach((hId) => {
        const currentProg = next[hId] || {
          level: 1,
          exp: 0,
          maxExp: 100,
          cp: 1,
          unlockedTalentIds: [],
        };
        const res = calculateLevelUp(currentProg.exp + gainedExp, currentProg.level, currentProg.maxExp);
        if (res.gainedLevels > 0) {
          const heroName = ALL_PLAYABLE_HEROES[hId]?.name || hId;
          leveledHeroes.push(`${heroName} (Lv.${res.newLevel}) +${res.gainedCP} CP!`);
        }
        next[hId] = {
          ...currentProg,
          level: res.newLevel,
          exp: res.newExp,
          maxExp: res.newMaxExp,
          cp: currentProg.cp + res.gainedCP,
        };
      });
      return next;
    });
    setLastLevelUps(leveledHeroes);

    // 3. Handle Rogue Bounty Clearance
    if (activeBountyId) {
      if (!clearedBountyIds.includes(activeBountyId)) {
        setClearedBountyIds((prev) => [...prev, activeBountyId]);
      }
      const bData = ROGUE_BOUNTIES.find((b) => b.id === activeBountyId);
      if (bData) {
        totalBounty += bData.rewardCoins;
        setScrapInventory((prev) => ({
          ...prev,
          [bData.rewardScrap.materialId]: (prev[bData.rewardScrap.materialId] || 0) + bData.rewardScrap.count,
        }));
      }
    }

    setEarnedCoinsTotal((prev) => prev + totalBounty);

    if (currentNode && !clearedNodeIds.includes(currentNode.id)) {
      setClearedNodeIds((prev) => [...prev, currentNode.id]);
    }

    if (
      (currentNode?.type === 'boss' || currentNodeIndex >= selectedSector.nodes.length - 1) &&
      !clearedSectorIds.includes(selectedSector.id)
    ) {
      setClearedSectorIds((prev) => [...prev, selectedSector.id]);
    }
  };

  const toggleHeroSelection = (heroId: string) => {
    audio.playBeep();
    if (selectedHeroIds.includes(heroId)) {
      if (selectedHeroIds.length <= 1) return;
      setSelectedHeroIds(selectedHeroIds.filter((id) => id !== heroId));
    } else {
      if (selectedHeroIds.length >= 3) {
        setSelectedHeroIds([...selectedHeroIds.slice(0, 2), heroId]);
      } else {
        setSelectedHeroIds([...selectedHeroIds, heroId]);
      }
    }
  };

  // Canvas Drawing
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    canvas.width = 400;
    canvas.height = 360;

    if (screenShakeRef.current > 0) {
      const sx = (Math.random() - 0.5) * screenShakeRef.current;
      const sy = (Math.random() - 0.5) * screenShakeRef.current;
      ctx.translate(sx, sy);
    }

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sunGrad = ctx.createLinearGradient(0, 20, 0, 160);
    if (selectedSector.id === 'sector_03') {
      sunGrad.addColorStop(0, '#06b6d4');
      sunGrad.addColorStop(1, '#0f172a');
    } else if (selectedSector.id === 'sector_02') {
      sunGrad.addColorStop(0, '#f97316');
      sunGrad.addColorStop(1, '#b45309');
    } else if (selectedSector.id === 'sector_05') {
      sunGrad.addColorStop(0, '#f43f5e');
      sunGrad.addColorStop(1, '#581c87');
    } else {
      sunGrad.addColorStop(0, '#ec4899');
      sunGrad.addColorStop(1, '#f59e0b');
    }
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, 110, 70, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 160, canvas.width, 200);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 1;
    const gridOffset = (tickCountRef.current * 1.5) % 24;

    for (let x = -80; x <= canvas.width + 80; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 160);
      ctx.lineTo(x + (x - canvas.width / 2) * 1.4, canvas.height);
      ctx.stroke();
    }
    for (let y = 160; y < canvas.height; y += 20) {
      const curY = y + gridOffset * ((y - 150) / 180);
      if (curY >= 160 && curY <= canvas.height) {
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(canvas.width, curY);
        ctx.stroke();
      }
    }

    // Draw Heroes
    party.forEach((hero, idx) => {
      ctx.save();
      const drawX = hero.x;
      const drawY = 175 + idx * 42;

      if (hero.dead) ctx.globalAlpha = 0.25;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.ellipse(drawX + 16, drawY + 34, 16, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      if (hero.atb >= 100 && !hero.dead) {
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(drawX + 16, drawY + 16, 20, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (hero.id === 'guardian') {
        drawPixelPet(ctx, pet, drawX, drawY, 30, 32, true, tickCountRef.current);
      } else {
        ctx.fillStyle = hero.color;
        ctx.fillRect(drawX + 8, drawY + 4, 16, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(drawX + 10, drawY + 8, 4, 4);
        ctx.fillRect(drawX + 18, drawY + 8, 4, 4);

        if (hero.role === 'Tank') {
          ctx.fillStyle = '#eab308';
          ctx.fillRect(drawX + 26, drawY + 6, 6, 22);
        } else if (hero.role === 'Mage') {
          ctx.fillStyle = '#c084fc';
          ctx.fillRect(drawX - 2, drawY + 2, 4, 26);
        }
      }

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(drawX, drawY + 38, 32, 4);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(drawX, drawY + 38, 32 * (hero.hp / hero.maxHp), 4);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(drawX, drawY + 43, 32, 3);
      ctx.fillStyle = hero.atb >= 100 ? '#facc15' : '#38bdf8';
      ctx.fillRect(drawX, drawY + 43, 32 * (hero.atb / 100), 3);

      ctx.restore();
    });

    // Draw Enemies
    enemies.forEach((enemy) => {
      if (enemy.dead) return;
      ctx.save();

      const drawX = enemy.x;
      const drawY = enemy.y;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.ellipse(drawX + 18, drawY + 34, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      if (currentTarget && currentTarget.id === enemy.id) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(drawX + 18, drawY + 16, 24, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = enemy.color;
      if (enemy.isBoss) {
        ctx.fillRect(drawX, drawY - 8, 36, 38);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(drawX + 6, drawY - 14, 24, 6);
      } else {
        ctx.fillRect(drawX + 6, drawY + 2, 24, 28);
      }

      ctx.fillStyle = '#ef4444';
      ctx.fillRect(drawX + 10, drawY + 8, 4, 4);
      ctx.fillRect(drawX + 22, drawY + 8, 4, 4);

      ctx.fillStyle = '#1e293b';
      ctx.fillRect(drawX, drawY + 38, 36, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(drawX, drawY + 38, 36 * (enemy.hp / enemy.maxHp), 4);

      ctx.restore();
    });

    // Atmospheric Hazard FX for Hazard Stages
    const currentStageNode = selectedSector.nodes[currentNodeIndex];
    if (currentStageNode?.type === 'hazard' || currentStageNode?.hazardEffect) {
      if (Math.random() < 0.35) {
        const isThermal = selectedSector.id === 'sector_02';
        const isCryo = selectedSector.id === 'sector_03';
        const isGlitch = selectedSector.id === 'sector_04' || selectedSector.id === 'sector_05';

        if (isThermal) {
          particlesRef.current.push({
            x: Math.random() * canvas.width,
            y: canvas.height + 5,
            vx: 0.8 + Math.random() * 1.5,
            vy: -1.2 - Math.random() * 1.8,
            size: 1.5 + Math.random() * 2,
            color: Math.random() < 0.5 ? '#f97316' : '#facc15',
            life: 1.5,
            maxLife: 1.5,
          });
        } else if (isCryo) {
          particlesRef.current.push({
            x: Math.random() * canvas.width,
            y: -5,
            vx: (Math.random() - 0.5) * 0.8,
            vy: 1.0 + Math.random() * 1.2,
            size: 1.5 + Math.random() * 2,
            color: Math.random() < 0.5 ? '#38bdf8' : '#e0f2fe',
            life: 1.8,
            maxLife: 1.8,
          });
        } else if (isGlitch) {
          particlesRef.current.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 2,
            size: 2.0 + Math.random() * 2,
            color: Math.random() < 0.5 ? '#c084fc' : '#f43f5e',
            life: 0.6,
            maxLife: 0.6,
          });
        }
      }
    }

    // Draw Particles & Floaters
    particlesRef.current.forEach((p) => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.life / p.maxLife), 0, Math.PI * 2);
      ctx.fill();
    });

    floatersRef.current.forEach((f) => {
      ctx.save();
      ctx.fillStyle = f.color;
      ctx.font = `bold ${f.fontSize || 13}px monospace`;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.03;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }
    for (let i = floatersRef.current.length - 1; i >= 0; i--) {
      const f = floatersRef.current[i];
      f.y += f.vy;
      f.life -= 0.025;
      if (f.life <= 0) floatersRef.current.splice(i, 1);
    }

    ctx.restore();
  };

  const filteredCodex = CODEX_ENTRIES.filter(
    (e) =>
      e.category === codexCategory &&
      (codexSearch === '' ||
        e.title.toLowerCase().includes(codexSearch.toLowerCase()) ||
        e.content.toLowerCase().includes(codexSearch.toLowerCase()))
  );

  const turnQueueUnits = [
    ...party
      .filter((h) => h.currentHp > 0)
      .map((h) => ({
        id: h.id,
        name: h.name,
        shortName: h.name.split(' ')[0],
        icon: h.role === 'Leader' ? '🗡️' : h.role === 'Tank' ? '🛡️' : h.role === 'Hacker' ? '💻' : h.role === 'Healer' ? '✨' : h.role === 'Berserker' ? '🪓' : '⚡',
        atb: h.atb,
        isHero: true,
        isActive: h.id === activeHeroId,
        hpPct: Math.round((h.currentHp / h.maxHp) * 100),
      })),
    ...enemies
      .filter((e) => e.currentHp > 0)
      .map((e) => ({
        id: e.id,
        name: e.name,
        shortName: e.name.length > 9 ? e.name.slice(0, 9) + '..' : e.name,
        icon: e.isBoss ? '👑' : '👾',
        atb: e.atb,
        isHero: false,
        isActive: false,
        hpPct: Math.round((e.currentHp / e.maxHp) * 100),
      })),
  ].sort((a, b) => b.atb - a.atb);

  return (
    <div className="flex-1 flex flex-col relative w-full h-full bg-slate-950 text-white select-none overflow-hidden font-pixel">
      {/* Top Header & Tab Navigation */}
      <div className="flex justify-between items-center px-3 py-2 bg-slate-900 border-b-2 border-slate-800 text-[9px] z-30">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => { setViewMode('sectors'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'sectors' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            🗺️ Sectors
          </button>
          <button
            onClick={() => { setViewMode('dungeon_map'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'dungeon_map' ? 'bg-amber-600 border-amber-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            🏰 Dungeon
          </button>
          <button
            onClick={() => { setViewMode('squad'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'squad' ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            👥 Squad
          </button>
          <button
            onClick={() => { setViewMode('talents'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'talents' ? 'bg-fuchsia-600 border-fuchsia-400 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            ⚡ Talents
          </button>
          <button
            onClick={() => { setViewMode('forge'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'forge' ? 'bg-orange-600 border-orange-400 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            ⚒️ Forge
          </button>
          <button
            onClick={() => { setViewMode('bounties'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'bounties' ? 'bg-rose-600 border-rose-400 text-white shadow-md' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            🎯 Bounties
          </button>
          <button
            onClick={() => { setViewMode('battle'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'battle' ? 'bg-red-600 border-red-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            ⚔️ Combat
          </button>
          <button
            onClick={() => { setViewMode('codex'); audio.playBeep(); }}
            className={`px-2 py-1 rounded border transition-colors ${
              viewMode === 'codex' ? 'bg-purple-600 border-purple-400 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            📖 Codex
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleBGM}
            className={`px-2 py-0.5 rounded text-[7.5px] border ${
              bgmEnabled ? 'bg-fuchsia-600 border-fuchsia-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {bgmEnabled ? '🔊 BGM ON' : '🔇 BGM OFF'}
          </button>
          <button
            onClick={() => onClose(earnedCoinsTotal)}
            className="pixel-btn bg-red-600 hover:bg-red-700 text-white px-2 py-1 text-[8px]"
          >
            QUIT
          </button>
        </div>
      </div>

      {/* VIEW: SECTORS MISSION SELECT */}
      {viewMode === 'sectors' && (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-yellow-400">MISSION SECTORS</h2>
              <p className="text-[7.5px] text-slate-400 font-vt">Deploy your Sovereign Bro squad to reclaim the Grid.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('squad')}
                className="text-[8px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded hover:bg-emerald-500/40"
              >
                👥 Edit Squad ({selectedHeroIds.length + 1}/4)
              </button>
              <span className="text-[8px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 px-2 py-0.5 rounded">
                +{earnedCoinsTotal}c Earned
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {RPG_SECTORS.map((sec) => (
              <div
                key={sec.id}
                className={`p-3 rounded-xl border-2 bg-gradient-to-r ${sec.bgGradient} border-slate-700 hover:border-blue-400 transition-all flex flex-col gap-2 relative overflow-hidden`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[7px] px-1.5 py-0.5 rounded bg-white/10 text-yellow-300 border border-white/20">
                      {sec.badge}
                    </span>
                    {clearedSectorIds.includes(sec.id) && (
                      <span className="text-[7px] px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500 text-emerald-300 font-bold">
                        🏆 LIBERATED
                      </span>
                    )}
                  </div>
                  <span className="text-[7px] text-emerald-400 font-bold">
                    BOUNTY: +{sec.rewardCoins} 🪙
                  </span>
                </div>

                <div>
                  <h3 className="text-[10px] font-bold text-white">{sec.name}</h3>
                  <p className="text-[8px] text-slate-300 font-vt leading-relaxed">{sec.description}</p>
                </div>

                <div className="flex justify-between items-center pt-1 border-t border-white/10">
                  <span className="text-[7px] text-slate-400">DANGER: {sec.difficulty} ({sec.nodes.length} Stages)</span>
                  <button
                    onClick={() => startSector(sec)}
                    className="pixel-btn bg-blue-500 hover:bg-blue-600 text-white text-[8px] px-3 py-1 font-bold"
                  >
                    DEPLOY SQUAD ▶
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: DUNGEON MAP & NODE EXPLORATION */}
      {viewMode === 'dungeon_map' && (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-amber-400">{selectedSector.name} — DUNGEON CRAWL</h2>
              <p className="text-[7.5px] text-slate-400 font-vt">Advance through sector nodes to reach the primary target.</p>
            </div>
            <button
              onClick={() => setViewMode('sectors')}
              className="text-[7.5px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
            >
              ◀ SECTORS
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {selectedSector.nodes.map((node, idx) => {
              const isCleared = clearedNodeIds.includes(node.id);
              const isCurrent = idx === currentNodeIndex;
              const isLocked = idx > currentNodeIndex && !isCleared;

              return (
                <div
                  key={node.id}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col gap-2 ${
                    isCurrent
                      ? 'bg-slate-900 border-amber-400 shadow-lg'
                      : isCleared
                      ? 'bg-slate-950/60 border-emerald-600/60 opacity-85'
                      : isLocked
                      ? 'bg-black/50 border-slate-800 opacity-50'
                      : 'bg-slate-900/80 border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <span className="text-xl select-none">{node.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9.5px] font-bold text-white">Stage {idx + 1}: {node.name}</span>
                          {isCleared && <span className="text-[7px] text-emerald-400 font-bold">✓ CLEARED</span>}
                          {node.branches && node.branches.length > 0 && (
                            <span className="text-[7px] px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 font-bold">
                              🔀 MULTI-PATH
                            </span>
                          )}
                        </div>
                        <p className="text-[7.5px] text-slate-300 font-vt">{node.description}</p>
                        {node.hazardEffect && (
                          <span className="text-[7px] text-red-400 font-vt">Hazard: {node.hazardEffect}</span>
                        )}
                      </div>
                    </div>

                    {!node.branches && (
                      <button
                        disabled={isLocked}
                        onClick={() => launchNode(node, idx)}
                        className={`pixel-btn px-3 py-1.5 text-[8px] font-bold ${
                          isLocked
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                            : isCurrent
                            ? 'bg-amber-500 hover:bg-amber-600 text-black animate-pulse'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isCleared ? 'REPLAY' : isCurrent ? 'ENTER STAGE ▶' : 'EXPLORE'}
                      </button>
                    )}
                  </div>

                  {/* Branch Vector Decision */}
                  {node.branches && node.branches.length > 0 && (!isLocked || isCleared) && (
                    <div className="mt-1 pt-2 border-t border-slate-800 flex flex-col gap-1.5">
                      <span className="text-[7.5px] text-amber-300 font-bold flex items-center gap-1">
                        <span>⚡</span> CHOOSE INFILTRATION VECTOR:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {node.branches.map((b) => (
                          <div
                            key={b.id}
                            className="bg-slate-950/80 border border-slate-700 hover:border-amber-400 p-2 rounded-lg flex flex-col justify-between gap-1.5 transition-colors"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-[8.5px] font-bold text-white flex items-center gap-1">
                                  <span>{b.icon}</span> {b.name}
                                </span>
                                {b.requiredRole && (
                                  <span className="text-[6.5px] px-1 py-0.5 rounded bg-indigo-950 border border-indigo-500 text-indigo-300 font-bold">
                                    🔑 {b.requiredRole} Req
                                  </span>
                                )}
                              </div>
                              <p className="text-[7px] text-slate-300 font-vt mt-0.5">{b.description}</p>
                            </div>

                            <div className="flex justify-between items-center pt-1 border-t border-slate-800/60 text-[6.5px]">
                              <div>
                                {b.bonusRewardCoins && (
                                  <span className="text-yellow-400 font-bold mr-1.5">+{b.bonusRewardCoins} Coins</span>
                                )}
                                {b.hazardEffect && (
                                  <span className="text-red-400">Hazard: {b.hazardEffect}</span>
                                )}
                              </div>
                              <button
                                onClick={() => selectBranchRoute(b)}
                                className="pixel-btn bg-amber-500 hover:bg-amber-400 text-black px-2 py-1 text-[7px] font-bold"
                              >
                                TAKE VECTOR ▶
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: NPC DIALOGUE & REPAIR HUB */}
      {viewMode === 'npc_dialogue' && activeNpcNode && (
        <div className="flex-1 p-4 flex flex-col justify-end bg-black/90 relative select-none">
          <div className="bg-slate-900 border-2 border-emerald-500 p-4 rounded-xl shadow-2xl relative">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10.5px] font-bold text-emerald-400">
                {activeNpcNode.npcSpeaker || activeNpcNode.name}
              </span>
              <span className="text-[7px] text-slate-400 font-vt">CAMPFIRE REST & REPAIR HUB</span>
            </div>

            <p className="text-[9px] text-slate-200 font-vt leading-relaxed mb-3">
              "{activeNpcNode.npcDialogue || activeNpcNode.description}"
            </p>

            <div className="bg-black/40 border border-emerald-500/30 p-2 rounded mb-3 text-[7.5px] text-emerald-300">
              ✨ Party HP and MP fully restored! Weapon registers recalibrated.
            </div>

            {/* Quick Hub Portals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              <button
                onClick={() => setViewMode('forge')}
                className="pixel-btn bg-orange-600 hover:bg-orange-500 text-white text-[7.5px] p-2 flex items-center justify-center gap-1 font-bold"
              >
                ⚒️ Master Forge
              </button>
              <button
                onClick={() => setViewMode('bounties')}
                className="pixel-btn bg-rose-600 hover:bg-rose-500 text-white text-[7.5px] p-2 flex items-center justify-center gap-1 font-bold"
              >
                🎯 Rogue Bounties
              </button>
              <button
                onClick={() => setViewMode('talents')}
                className="pixel-btn bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[7.5px] p-2 flex items-center justify-center gap-1 font-bold"
              >
                ⚡ Talent Trees
              </button>
              <button
                onClick={() => setViewMode('squad')}
                className="pixel-btn bg-emerald-600 hover:bg-emerald-500 text-white text-[7.5px] p-2 flex items-center justify-center gap-1 font-bold"
              >
                👥 Squad Loadout
              </button>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  if (!clearedNodeIds.includes(activeNpcNode.id)) {
                    setClearedNodeIds((prev) => [...prev, activeNpcNode.id]);
                  }
                  setCurrentNodeIndex((prev) => Math.min(selectedSector.nodes.length - 1, prev + 1));
                  setViewMode('dungeon_map');
                }}
                className="pixel-btn bg-emerald-500 hover:bg-emerald-400 text-black text-[8px] px-3 py-1 font-bold"
              >
                PROCEED TO NEXT STAGE ▶
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: SQUAD ROSTER BUILDER & RELIC EQUIPMENT */}
      {viewMode === 'squad' && (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-emerald-400">SQUAD BUILDER & DUAL TECHS</h2>
              <p className="text-[7.5px] text-slate-400 font-vt">
                Assemble your 3-Hero Battle Lineup + Companion Pet Guardian. Equip relics and unlock Dual Techs.
              </p>
            </div>
            <button
              onClick={() => setViewMode('dungeon_map')}
              className="pixel-btn bg-blue-600 text-white text-[8px] px-2.5 py-1"
            >
              DEPLOY TO DUNGEON ▶
            </button>
          </div>

          {/* Active Squad Bar */}
          <div className="bg-slate-900/90 border border-emerald-500/40 p-2.5 rounded-xl flex flex-col gap-1.5">
            <span className="text-[8px] font-bold text-yellow-400">ACTIVE BATTLE ROSTER (4 UNITS)</span>
            <div className="grid grid-cols-4 gap-1.5 text-[7px]">
              <div className="p-1.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-center">
                <div className="text-cyan-400 font-bold truncate">Guardian Pet</div>
                <div className="text-slate-300 text-[6.5px]">Aura Leader</div>
              </div>
              {selectedHeroIds.map((hId) => {
                const hero = ALL_PLAYABLE_HEROES[hId];
                return (
                  <div key={hId} className="p-1.5 rounded bg-slate-800/80 border border-slate-700 text-center">
                    <div className="text-white font-bold truncate">{hero?.name}</div>
                    <div className="text-emerald-400 text-[6.5px]">[{hero?.role}]</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dual Techs Available */}
          <div className="bg-slate-900/80 border border-yellow-500/40 p-2.5 rounded-xl flex flex-col gap-1">
            <span className="text-[8px] font-bold text-yellow-400">ACTIVE SQUAD DUAL TECH COMBOS</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[7px]">
              {availableDualTechs.map((tech) => (
                <div key={tech.id} className="p-1.5 rounded bg-black/40 border border-slate-700">
                  <div className="flex justify-between items-center text-yellow-300 font-bold">
                    <span>⚡ {tech.name}</span>
                    <span>{tech.limitCost}% Limit</span>
                  </div>
                  <p className="text-[6.5px] text-slate-300 font-vt">{tech.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Character Cards */}
          <div className="grid grid-cols-1 gap-2">
            {Object.values(ALL_PLAYABLE_HEROES).map((hero) => {
              const isSelected = selectedHeroIds.includes(hero.id);
              const equippedRelicId = heroRelicMap[hero.id];
              const equippedRelic = RPG_RELICS.find((r) => r.id === equippedRelicId);

              return (
                <div
                  key={hero.id}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col gap-2 ${
                    isSelected ? 'bg-slate-900 border-emerald-500 shadow-md' : 'bg-slate-950/80 border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: hero.color }} />
                      <div>
                        <span className="text-[10px] font-bold text-white">{hero.name}</span>
                        <span className="text-[7.5px] text-slate-400 ml-1.5 font-vt">({hero.title})</span>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleHeroSelection(hero.id)}
                      className={`text-[7.5px] px-2 py-1 rounded font-bold ${
                        isSelected ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                      }`}
                    >
                      {isSelected ? 'REMOVE' : 'RECRUIT'}
                    </button>
                  </div>

                  <div className="grid grid-cols-5 gap-1 text-[7px] text-slate-300 bg-black/50 p-1.5 rounded">
                    <span>ROLE: {hero.role}</span>
                    <span>HP: {hero.maxHp}</span>
                    <span>MP: {hero.maxMp}</span>
                    <span>ATK: {hero.atk}</span>
                    <span>DEF: {hero.def}</span>
                  </div>

                  <div className="text-[7.5px] text-yellow-300 font-vt">
                    <span className="font-bold">LIMIT BREAK: </span>
                    {hero.limitName} — <em>{hero.limitDesc}</em>
                  </div>

                  {/* Relic Selector */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[7px]">
                    <span className="text-slate-400">EQUIPPED RELIC:</span>
                    <select
                      value={equippedRelicId || ''}
                      onChange={(e) => {
                        setHeroRelicMap((prev) => ({ ...prev, [hero.id]: e.target.value }));
                        audio.playCoin();
                      }}
                      className="bg-slate-800 text-white text-[7px] px-2 py-0.5 rounded border border-slate-700"
                    >
                      <option value="">None</option>
                      {RPG_RELICS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.icon} {r.name} ({r.tier})
                        </option>
                      ))}
                    </select>
                  </div>
                  {equippedRelic && (
                    <div className="text-[6.5px] text-cyan-400 font-vt">
                      Passive Buff: {equippedRelic.passiveDesc}
                    </div>
                  )}

                  {/* Progression & Talents */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[7.5px]">
                    <span className="text-emerald-400 font-bold">
                      LVL {heroProgressionMap[hero.id]?.level || 1} • CP: {heroProgressionMap[hero.id]?.cp || 0}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedTalentHeroId(hero.id);
                        audio.playBeep();
                        setViewMode('talents');
                      }}
                      className="pixel-btn bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[7px] px-2 py-0.5 font-bold"
                    >
                      ⚡ TALENTS & SPECS ▶
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: DIALOGUE CUTSCENE */}
      {viewMode === 'dialogue' && (
        <div
          onClick={advanceDialogue}
          className="flex-1 p-4 flex flex-col justify-end bg-black/90 cursor-pointer relative select-none"
        >
          <div className="bg-slate-900 border-2 border-blue-500 p-4 rounded-xl shadow-2xl relative">
            <div className="flex justify-between items-center mb-2">
              <span
                className="text-[10px] font-bold"
                style={{ color: selectedSector.storyIntro[dialogueIndex]?.color || '#38bdf8' }}
              >
                {selectedSector.storyIntro[dialogueIndex]?.speaker}
              </span>
              <span className="text-[7px] text-slate-400 font-vt">
                {dialogueIndex + 1} / {selectedSector.storyIntro.length}
              </span>
            </div>

            <p className="text-[9px] text-slate-200 font-vt leading-relaxed mb-4">
              {selectedSector.storyIntro[dialogueIndex]?.text}
            </p>

            <div className="flex justify-between items-center text-[7px] text-blue-400">
              <span className="animate-pulse">▶ TAP SCREEN TO ADVANCE</span>
              <button
                onClick={(e) => { e.stopPropagation(); setViewMode('dungeon_map'); }}
                className="text-slate-400 hover:text-white underline"
              >
                SKIP BRIEFING
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: COMBAT BATTLEGROUND */}
      {viewMode === 'battle' && (
        <div className="flex-1 flex flex-col relative bg-black overflow-hidden">
          {bossTelegraph && (
            <div className="bg-red-950 border-b border-red-500 px-3 py-1 text-center text-[8px] text-yellow-300 font-bold animate-pulse z-20">
              {bossTelegraph}
            </div>
          )}

          {/* TURN ORDER QUEUE TIMELINE (Grandia / FFX ATB Flow) */}
          <div className="bg-slate-950/95 border-b border-slate-800 px-2.5 py-1 flex flex-col gap-1 z-20">
            <div className="flex justify-between items-center text-[6.5px] text-slate-400 font-vt tracking-wider">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="text-cyan-400 font-bold">⏱️ TURN QUEUE</span>
                <span>| WAIT (0%)</span>
              </span>
              <span className="text-slate-600">CHARGE (50%)</span>
              <span className="flex items-center gap-1 text-yellow-400 font-bold animate-pulse">
                <span>READY ▶ ACT (100%)</span>
                <span>⚡</span>
              </span>
            </div>

            <div className="relative h-8 bg-slate-900/90 rounded-md border border-slate-800 px-2 flex items-center overflow-hidden shadow-inner">
              {/* Timeline Track Lines */}
              <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-slate-800 via-indigo-950 to-amber-900/50 rounded-full" />
              <div className="absolute left-1/2 top-1 bottom-1 w-px bg-slate-800/80" />

              {/* Unit Turn Markers */}
              {turnQueueUnits.map((u) => {
                const isReady = u.atb >= 100;
                const pct = Math.min(93, Math.max(3, u.atb));
                return (
                  <div
                    key={u.id}
                    style={{ left: `${pct}%` }}
                    className={`absolute -translate-x-1/2 flex flex-col items-center transition-all duration-150 z-10 ${
                      u.isActive ? 'scale-110 z-30' : ''
                    }`}
                    title={`${u.name} (ATB: ${Math.round(u.atb)}%)`}
                  >
                    <div
                      className={`w-5 h-5 rounded flex items-center justify-center text-[9.5px] font-bold border shadow transition-all ${
                        u.isHero
                          ? u.isActive
                            ? 'bg-amber-400 border-white text-black ring-2 ring-amber-300 shadow-amber-500/50 animate-bounce'
                            : isReady
                            ? 'bg-cyan-500 border-cyan-200 text-black animate-pulse'
                            : 'bg-indigo-950 border-cyan-500/60 text-cyan-200'
                          : isReady
                          ? 'bg-red-600 border-red-300 text-white animate-pulse'
                          : 'bg-red-950 border-red-500/60 text-red-200'
                      }`}
                    >
                      {u.icon}
                    </div>
                    <span
                      className={`text-[5px] font-pixel tracking-tighter px-0.5 rounded leading-none ${
                        u.isHero ? 'text-cyan-300 bg-black/70' : 'text-red-400 bg-black/70'
                      }`}
                    >
                      {u.shortName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative w-full h-[320px] bg-slate-950 flex-shrink-0">
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>

          <div className="flex-1 bg-slate-950 border-t-2 border-slate-800 p-2 flex flex-col justify-between overflow-y-auto">
            <div className="flex justify-between items-center text-[8px] border-b border-slate-800 pb-1 text-slate-400 font-vt">
              <span>STAGE {currentNodeIndex + 1}: {selectedSector.nodes[currentNodeIndex]?.name}</span>
              <span className="text-yellow-400">TARGET: {currentTarget ? currentTarget.name : 'NONE'}</span>
            </div>

            {/* Tactical Buttons */}
            {activeHero ? (
              <div className="flex flex-col gap-1.5 py-1">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] text-cyan-400 font-bold">
                    {activeHero.name} ({activeHero.role})
                  </span>
                  <span className="text-[8px] text-purple-400 font-vt">
                    MP: {activeHero.mp}/{activeHero.maxMp}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1">
                  <button
                    onClick={handleHeroAttack}
                    className="pixel-btn p-1.5 bg-red-600 hover:bg-red-500 text-white text-[8px] font-bold"
                  >
                    ⚔️ ATK
                  </button>

                  <button
                    onClick={() => { setSelectedSkill(activeHero.skills[0] || null); setSelectedDualTech(null); }}
                    className="pixel-btn p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[8px] font-bold"
                  >
                    ⚡ SKILL
                  </button>

                  <button
                    onClick={() => { setSelectedDualTech(availableDualTechs[0] || null); setSelectedSkill(null); }}
                    className="pixel-btn p-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[8px] font-bold"
                  >
                    🤝 DUAL
                  </button>

                  <button
                    onClick={handleHeroDefend}
                    className="pixel-btn p-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[8px] font-bold"
                  >
                    🛡️ DEF
                  </button>

                  <button
                    onClick={() => handleUseItem(items[0])}
                    className="pixel-btn p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[8px] font-bold"
                  >
                    🧪 HEAL
                  </button>
                </div>

                {/* Skill Drawer */}
                {selectedSkill && (
                  <div className="bg-slate-900 border border-indigo-500 p-1.5 rounded flex items-center justify-between text-[8px]">
                    <div>
                      <span className="text-indigo-400 font-bold">{selectedSkill.name}</span>
                      <span className="text-slate-400 text-[7px] ml-1">({selectedSkill.mpCost} MP)</span>
                    </div>
                    <button
                      onClick={() => handleHeroSkill(selectedSkill)}
                      className="pixel-btn bg-indigo-500 px-2 py-0.5 text-[7px] text-white"
                    >
                      CAST ▶
                    </button>
                  </div>
                )}

                {/* Dual Tech Drawer */}
                {selectedDualTech && (
                  <div className="bg-slate-900 border border-amber-500 p-1.5 rounded flex flex-col gap-1 text-[8px]">
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-bold">🤝 {selectedDualTech.name}</span>
                      <span className="text-yellow-300 text-[7px]">Cost: {selectedDualTech.limitCost}% Limit / {selectedDualTech.mpCost} MP</span>
                    </div>
                    <p className="text-[6.5px] text-slate-300 font-vt">{selectedDualTech.description}</p>
                    <button
                      onClick={() => handleExecuteDualTech(selectedDualTech)}
                      className="pixel-btn bg-amber-500 text-black font-bold px-2 py-1 text-[7px] self-end"
                    >
                      UNLEASH DUAL COMBO ▶
                    </button>
                  </div>
                )}

                {/* Limit Break Button */}
                {activeHero.limit >= 100 && (
                  <button
                    onClick={handleHeroLimitBreak}
                    className="pixel-btn p-2 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold text-[8.5px] animate-pulse flex justify-between items-center shadow-lg"
                  >
                    <span>💥 {activeHero.limitName}</span>
                    <span>100% READY!</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[8px] text-slate-500 font-vt animate-pulse">
                CHRONO TURN CYCLE CHARGING (ATB)...
              </div>
            )}

            {/* Mini Squad Status Bar */}
            <div className="grid grid-cols-4 gap-1 pt-1 border-t border-slate-800 text-[7px]">
              {party.map((h) => (
                <div
                  key={h.id}
                  onClick={() => h.atb >= 100 && !h.dead && setActiveHeroId(h.id)}
                  className={`p-1 rounded border ${
                    activeHero?.id === h.id ? 'border-cyan-400 bg-cyan-950/40' : 'border-slate-800 bg-slate-900/60'
                  } ${h.dead ? 'opacity-30' : ''}`}
                >
                  <div className="truncate font-bold text-slate-200">{h.name}</div>
                  <div className="text-emerald-400">{h.hp}/{h.maxHp}</div>
                  <div className="w-full bg-slate-800 h-1 rounded mt-0.5 overflow-hidden">
                    <div
                      className={`h-full ${h.atb >= 100 ? 'bg-yellow-400' : 'bg-blue-500'}`}
                      style={{ width: `${h.atb}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Victory Overlay */}
          {combatPhase === 'victory' && (
            <div className="absolute inset-0 bg-black/92 flex flex-col items-center justify-center p-5 text-center z-40 animate-fade-in overflow-y-auto max-h-full">
              {activeBountyId ? (
                <div className="mb-2 p-2 rounded-xl bg-rose-950/80 border-2 border-rose-500 shadow-xl max-w-sm">
                  <div className="text-2xl mb-0.5">🎯</div>
                  <h2 className="text-sm font-bold text-rose-300">ROGUE BOUNTY NEUTRALIZED!</h2>
                  <p className="text-[7.5px] text-slate-300 font-vt">
                    Autonomous construct deactivated. Quantum scrap and massive bounty secured.
                  </p>
                </div>
              ) : currentNodeIndex >= selectedSector.nodes.length - 1 || selectedSector.nodes[currentNodeIndex]?.type === 'boss' ? (
                <>
                  <div className="text-3xl mb-1 select-none">🏆</div>
                  <h2 className="text-lg sm:text-xl text-yellow-400 font-bold mb-1">SECTOR LIBERATED!</h2>
                  <p className="text-[9px] text-emerald-400 font-vt mb-1">
                    Hegemony control severed in {selectedSector.name}!
                  </p>
                  <p className="text-[10px] text-yellow-300 font-vt mb-2">
                    +{selectedSector.rewardCoins} Sector Bounty Bonus Secured!
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-lg text-emerald-400 font-bold mb-1">STAGE CLEARED!</h2>
                  <p className="text-[9px] text-yellow-400 font-vt mb-2">
                    +{selectedSector.nodes[currentNodeIndex]?.rewardCoins || 25} Data-Coins Secured
                  </p>
                </>
              )}

              {/* Scrap Loot Drops */}
              {lastLootDrops.length > 0 && (
                <div className="w-full max-w-xs mb-2 p-2 rounded bg-slate-900/90 border border-amber-500/40 text-[7px]">
                  <div className="text-amber-400 font-bold mb-1 flex items-center justify-center gap-1">
                    <span>📦</span> SCRAP SALVAGE HARVESTED:
                  </div>
                  <div className="flex flex-wrap justify-center gap-1">
                    {lastLootDrops.map((d, i) => (
                      <span key={i} className="px-1.5 py-0.5 rounded bg-black/60 border border-amber-500/50 text-amber-200">
                        ⚙️ {d.name} x{d.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Hero Level Ups */}
              {lastLevelUps.length > 0 && (
                <div className="w-full max-w-xs mb-2 p-2 rounded bg-fuchsia-950/80 border border-fuchsia-500/50 text-[7px]">
                  <div className="text-fuchsia-300 font-bold mb-1 flex items-center justify-center gap-1">
                    <span>⭐</span> CODE POINT (CP) UNLOCKED!
                  </div>
                  <div className="flex flex-col gap-0.5 text-yellow-300 font-vt">
                    {lastLevelUps.map((lvl, i) => (
                      <div key={i}>{lvl}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                {activeBountyId ? (
                  <button
                    onClick={() => {
                      setActiveBountyId(null);
                      setViewMode('bounties');
                    }}
                    className="pixel-btn bg-rose-500 hover:bg-rose-400 text-white px-3 py-1.5 text-[8px] font-bold"
                  >
                    BOUNTY BOARD ▶
                  </button>
                ) : currentNodeIndex >= selectedSector.nodes.length - 1 || selectedSector.nodes[currentNodeIndex]?.type === 'boss' ? (
                  <button
                    onClick={() => setViewMode('sectors')}
                    className="pixel-btn bg-yellow-500 hover:bg-yellow-400 text-black px-3 py-1.5 text-[8.5px] font-bold"
                  >
                    MISSION SELECT ▶
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const nextIdx = Math.min(selectedSector.nodes.length - 1, currentNodeIndex + 1);
                      setCurrentNodeIndex(nextIdx);
                      launchNode(selectedSector.nodes[nextIdx], nextIdx);
                    }}
                    className="pixel-btn bg-emerald-500 hover:bg-emerald-400 text-black px-3 py-1.5 text-[8.5px] font-bold"
                  >
                    NEXT STAGE ▶
                  </button>
                )}

                <button
                  onClick={() => setViewMode('dungeon_map')}
                  className="pixel-btn bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1.5 text-[8px]"
                >
                  DUNGEON MAP
                </button>
                <button
                  onClick={() => setViewMode('forge')}
                  className="pixel-btn bg-orange-600 hover:bg-orange-500 text-white px-2.5 py-1.5 text-[8px] font-bold"
                >
                  ⚒️ FORGE
                </button>
                <button
                  onClick={() => setViewMode('talents')}
                  className="pixel-btn bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-2.5 py-1.5 text-[8px] font-bold"
                >
                  ⚡ TALENTS
                </button>
              </div>
            </div>
          )}

          {/* Defeat Overlay */}
          {combatPhase === 'defeat' && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center p-6 text-center z-40 animate-fade-in">
              <h2 className="text-xl text-red-500 font-bold mb-2">SQUAD DE-SYNCED</h2>
              <p className="text-[9px] text-slate-400 font-vt mb-4">Firewalls reinforced. Regroup at the Ping Lounge.</p>
              <button
                onClick={() => setViewMode('dungeon_map')}
                className="pixel-btn bg-red-500 text-white px-4 py-2 text-[9px] font-bold"
              >
                RETURN TO DUNGEON
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW: CODEX & COMPENDIUM */}
      {viewMode === 'codex' && (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-purple-400">AETHEL-NET WORLD CODEX</h2>
              <p className="text-[7.5px] text-slate-400 font-vt">
                Complete lore compendium: History, Heroes, NPCs, Kingdoms, Factions, Cults, Gangs, Code Arts & Bestiary.
              </p>
            </div>
            <input
              type="text"
              placeholder="Search codex..."
              value={codexSearch}
              onChange={(e) => setCodexSearch(e.target.value)}
              className="bg-slate-900 text-white text-[7.5px] px-2 py-1 rounded border border-slate-700 w-28"
            />
          </div>

          <div className="flex gap-1 overflow-x-auto pb-1">
            {(
              [
                'History',
                'Heroes',
                'NPCs',
                'Kingdoms',
                'Factions',
                'Cults',
                'Gangs',
                'Code Arts',
                'Bestiary',
              ] as CodexCategory[]
            ).map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCodexCategory(cat);
                  audio.playBeep();
                }}
                className={`px-2 py-1 rounded text-[7.5px] border whitespace-nowrap transition-colors ${
                  codexCategory === cat ? 'bg-purple-600 border-purple-400 text-white font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {codexCategory === 'Bestiary' ? (
            <div className="flex flex-col gap-2">
              {BESTIARY_DATA.map((rec) => (
                <div key={rec.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/90 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base select-none">{rec.icon}</span>
                      <div>
                        <h3 className="text-[9.5px] font-bold text-white">{rec.name}</h3>
                        <span className="text-[7px] text-slate-400 font-vt">{rec.title}</span>
                      </div>
                    </div>
                    <span className="text-[7px] px-1.5 py-0.5 rounded bg-red-950 border border-red-500 text-red-300 font-bold uppercase">
                      {rec.element}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-[7px] text-slate-300 bg-black/40 p-1.5 rounded">
                    <span>HP: {rec.baseHp}</span>
                    <span>ATK: {rec.baseAtk}</span>
                    <span>DEF: {rec.baseDef}</span>
                    <span>SPD: {rec.spd}</span>
                  </div>

                  <p className="text-[7.5px] text-slate-300 font-vt leading-relaxed">{rec.description}</p>

                  <div className="flex justify-between items-center text-[7px] pt-1 border-t border-slate-800">
                    <span className="text-cyan-400 font-bold">WEAKNESS: {rec.weakness}</span>
                    <span className="text-yellow-400">DROPS: {rec.drops}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredCodex.map((entry) => (
                <div key={entry.title} className="p-3 rounded-xl border border-slate-800 bg-slate-900/90 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base select-none">{entry.icon}</span>
                    <div>
                      <h3 className="text-[9.5px] font-bold text-white">{entry.title}</h3>
                      {entry.subtitle && <span className="text-[7px] text-purple-300 font-vt">{entry.subtitle}</span>}
                    </div>
                  </div>

                  {entry.stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[7px] text-slate-300 bg-black/40 p-1.5 rounded">
                      {entry.stats.map((s) => (
                        <span key={s.label}>
                          <strong className="text-slate-400">{s.label}:</strong> {s.value}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-[8px] text-slate-300 font-vt leading-relaxed whitespace-pre-line">{entry.content}</p>

                  {entry.tags && (
                    <div className="flex gap-1 flex-wrap pt-1">
                      {entry.tags.map((t) => (
                        <span key={t} className="text-[6.5px] px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-800 text-purple-300">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW: HERO TALENT TREES & CODE POINTS (CP) */}
      {viewMode === 'talents' && (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-fuchsia-400">HERO TALENT MATRICES & CODE POINTS (CP)</h2>
              <p className="text-[7.5px] text-slate-400 font-vt">
                Allocate unthrottled Code Points (CP) earned from battle victories to specialize hero architectures.
              </p>
            </div>
            <button
              onClick={() => { setViewMode('squad'); audio.playBeep(); }}
              className="text-[7.5px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
            >
              ◀ SQUAD ROSTER
            </button>
          </div>

          {/* Hero Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {Object.values(ALL_PLAYABLE_HEROES).map((h) => {
              const prog = heroProgressionMap[h.id] || { level: 1, exp: 0, maxExp: 100, cp: 0, unlockedTalentIds: [] };
              const isSelected = selectedTalentHeroId === h.id;
              return (
                <button
                  key={h.id}
                  onClick={() => {
                    setSelectedTalentHeroId(h.id);
                    audio.playBeep();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center gap-2 transition-all ${
                    isSelected
                      ? 'bg-fuchsia-950/90 border-fuchsia-400 text-white shadow-lg'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: h.color }} />
                  <div>
                    <div className="text-[8px] font-bold leading-tight">{h.name}</div>
                    <div className="text-[6.5px] text-slate-400 font-vt">
                      Lv.{prog.level} • <span className="text-yellow-400">{prog.cp} CP</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Hero Talent Matrix */}
          {(() => {
            const hero = ALL_PLAYABLE_HEROES[selectedTalentHeroId];
            const prog = heroProgressionMap[selectedTalentHeroId] || { level: 1, exp: 0, maxExp: 100, cp: 0, unlockedTalentIds: [] };
            const heroTalents = HERO_TALENT_TREES[selectedTalentHeroId] || [];

            if (!hero) return null;

            const specATalents = heroTalents.filter((t) => t.spec === 'specA');
            const specBTalents = heroTalents.filter((t) => t.spec === 'specB');
            const specAName = specATalents[0]?.specName || 'Specialization Alpha';
            const specBName = specBTalents[0]?.specName || 'Specialization Beta';

            const specs = [
              { key: 'specA', name: specAName, icon: '⚡', talents: specATalents },
              { key: 'specB', name: specBName, icon: '🔥', talents: specBTalents },
            ];

            return (
              <div className="flex flex-col gap-3">
                {/* Hero Header Card */}
                <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/90 flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold border" style={{ borderColor: hero.color, backgroundColor: `${hero.color}20` }}>
                      {hero.role === 'Leader' ? '🗡️' : hero.role === 'Tank' ? '🛡️' : hero.role === 'Hacker' ? '💻' : hero.role === 'Healer' ? '✨' : hero.role === 'Berserker' ? '🪓' : '⚡'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-white">{hero.name}</span>
                        <span className="text-[7.5px] text-slate-400 font-vt">({hero.title})</span>
                        <span className="text-[7px] px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 font-bold uppercase">
                          {hero.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[7.5px] text-emerald-400 font-bold">LEVEL {prog.level}</span>
                        <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, (prog.exp / prog.maxExp) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[6.5px] text-slate-400 font-vt">
                          {prog.exp}/{prog.maxExp} EXP
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-yellow-950/60 border border-yellow-500/50 text-right">
                    <div className="text-[7px] text-yellow-300/80 font-vt">UNSPENT CODE POINTS</div>
                    <div className="text-xs font-bold text-yellow-400">⚡ {prog.cp} CP</div>
                  </div>
                </div>

                {/* Two Specialization Trees */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {specs.map((spec) => (
                    <div
                      key={spec.key}
                      className="p-3 rounded-xl border border-slate-800 bg-slate-950/70 flex flex-col gap-2.5"
                    >
                      <div className="border-b border-slate-800/80 pb-1.5 flex items-center gap-2">
                        <span className="text-base select-none">{spec.icon}</span>
                        <div>
                          <h3 className="text-[9px] font-bold text-white">{spec.name}</h3>
                          <p className="text-[6.5px] text-slate-400 font-vt">Combat Archetype Matrix</p>
                        </div>
                      </div>

                      {spec.talents.map((talent) => {
                        const isUnlocked = prog.unlockedTalentIds.includes(talent.id);
                        const isTier1Unlocked =
                          talent.tier === 1 ||
                          spec.talents.some((t) => t.tier === 1 && prog.unlockedTalentIds.includes(t.id));
                        const canUnlock = !isUnlocked && isTier1Unlocked && prog.cp >= talent.costCP;

                        return (
                          <div
                            key={talent.id}
                            className={`p-2.5 rounded-lg border transition-all flex flex-col gap-1 ${
                              isUnlocked
                                ? 'bg-emerald-950/50 border-emerald-500/70'
                                : canUnlock
                                ? 'bg-slate-900 border-fuchsia-500/60'
                                : 'bg-black/40 border-slate-800 opacity-60'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs select-none">{talent.icon}</span>
                                <div>
                                  <span className="text-[8px] font-bold text-white">Tier {talent.tier}: {talent.name}</span>
                                  <span className="text-[6.5px] text-slate-400 ml-1">({talent.costCP} CP)</span>
                                </div>
                              </div>
                              {isUnlocked ? (
                                <span className="text-[6.5px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                                  ✓ ACTIVE
                                </span>
                              ) : (
                                <button
                                  disabled={!canUnlock}
                                  onClick={() => handleUnlockTalent(selectedTalentHeroId, talent.id, talent.costCP)}
                                  className={`pixel-btn px-2 py-0.5 text-[7px] font-bold ${
                                    canUnlock
                                      ? 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white animate-pulse'
                                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                  }`}
                                >
                                  {!isTier1Unlocked ? 'REQUIRES TIER 1' : `UNLOCK [${talent.costCP} CP]`}
                                </button>
                              )}
                            </div>

                            <p className="text-[7px] text-slate-300 font-vt">{talent.description}</p>
                            <div className="text-[6.5px] text-cyan-300 font-vt font-bold">
                              {talent.perkText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* VIEW: RELIC FORGE & SCRAP SYNTHESIZER */}
      {viewMode === 'forge' && (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-orange-400">MASTER CACHE'S HARDWARE FORGE</h2>
              <p className="text-[7.5px] text-slate-400 font-vt">
                Synthesize scavenged hardware components into legendary Mk.II cybernetic relics.
              </p>
            </div>
            <button
              onClick={() => { setViewMode('dungeon_map'); audio.playBeep(); }}
              className="text-[7.5px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
            >
              ◀ DUNGEON MAP
            </button>
          </div>

          {/* Scrap Inventory Bar */}
          <div className="p-2.5 rounded-xl border border-orange-500/40 bg-orange-950/30 flex flex-col gap-1">
            <span className="text-[8px] font-bold text-orange-300">HARDWARE SCRAP INVENTORY</span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[7.5px]">
              {Object.values(SCRAP_MATERIALS).map((mat) => {
                const count = scrapInventory[mat.id] || 0;
                return (
                  <div key={mat.id} className="p-1.5 rounded bg-black/50 border border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span>{mat.icon}</span>
                      <span className="text-slate-300 truncate font-vt">{mat.name}</span>
                    </div>
                    <span className="text-yellow-400 font-bold font-mono">x{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {forgeSuccessMessage && (
            <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-500 text-emerald-300 text-[8px] font-bold text-center animate-pulse">
              ✨ {forgeSuccessMessage}
            </div>
          )}

          {/* Relic Forge Recipes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {RELIC_FORGE_RECIPES.map((recipe) => {
              const canForge = canForgeRecipe(recipe, scrapInventory, earnedCoinsTotal);
              const isEquippedAny = Object.values(heroRelicMap).includes(recipe.id);

              return (
                <div
                  key={recipe.id}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col justify-between gap-2 ${
                    isEquippedAny
                      ? 'bg-slate-900/90 border-emerald-500 shadow-md'
                      : canForge
                      ? 'bg-slate-900 border-orange-400 shadow-md'
                      : 'bg-slate-950/70 border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg select-none">⚒️</span>
                        <div>
                          <h3 className="text-[9px] font-bold text-white">{recipe.name}</h3>
                          <span className="text-[6.5px] text-orange-400 font-vt">UPGRADED {recipe.tier} RELIC</span>
                        </div>
                      </div>
                      {isEquippedAny && (
                        <span className="text-[6.5px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                          ✓ SYNTHESIZED
                        </span>
                      )}
                    </div>

                    <p className="text-[7px] text-slate-300 font-vt">{recipe.description}</p>

                    {/* Material Cost Breakdown */}
                    <div className="mt-1 pt-1 border-t border-slate-800/80 flex flex-wrap gap-1 text-[6.5px]">
                      {recipe.coinCost > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            earnedCoinsTotal >= recipe.coinCost
                              ? 'bg-amber-950/60 border-amber-500/40 text-yellow-300 font-bold'
                              : 'bg-red-950/60 border-red-500/40 text-red-300'
                          }`}
                        >
                          🪙 {recipe.coinCost}c
                        </span>
                      )}
                      {recipe.materials.map((req) => {
                        const owned = scrapInventory[req.materialId] || 0;
                        const mat = SCRAP_MATERIALS[req.materialId];
                        const isEnough = owned >= req.count;
                        return (
                          <span
                            key={req.materialId}
                            className={`px-1.5 py-0.5 rounded border ${
                              isEnough
                                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                : 'bg-red-950/60 border-red-500/40 text-red-300'
                            }`}
                          >
                            {mat?.icon} {mat?.name || req.materialId}: {owned}/{req.count}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      disabled={!canForge}
                      onClick={() => handleForgeRecipe(recipe)}
                      className={`pixel-btn px-3 py-1 text-[7.5px] font-bold ${
                        canForge
                          ? 'bg-orange-500 hover:bg-orange-400 text-black animate-pulse'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isEquippedAny ? 'FORGE DUPLICATE ⚒️' : 'SYNTHESIZE MK.II ⚒️'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: ROGUE BOUNTIES TERMINAL */}
      {viewMode === 'bounties' && (
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
            <div>
              <h2 className="text-xs font-bold text-rose-400">HEGEMONY ROGUE BOUNTY BOARD</h2>
              <p className="text-[7.5px] text-slate-400 font-vt">
                High-threat autonomous constructs operating outside algorithmic control. Eliminate for rare materials & bounty credits.
              </p>
            </div>
            <button
              onClick={() => { setViewMode('dungeon_map'); audio.playBeep(); }}
              className="text-[7.5px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
            >
              ◀ DUNGEON MAP
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {ROGUE_BOUNTIES.map((bounty) => {
              const isCleared = clearedBountyIds.includes(bounty.id);

              return (
                <div
                  key={bounty.id}
                  className={`p-3 rounded-xl border-2 transition-all flex flex-col gap-2 ${
                    isCleared
                      ? 'bg-slate-950/70 border-emerald-500/60 opacity-80'
                      : 'bg-slate-900 border-rose-500/80 shadow-lg'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-xl select-none">{bounty.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-[10px] font-bold text-white">{bounty.name}</h3>
                          <span className={`text-[6.5px] px-1.5 py-0.5 rounded border font-bold uppercase ${
                            bounty.difficulty === 'NIGHTMARE'
                              ? 'bg-red-950 border-red-500 text-red-300'
                              : bounty.difficulty === 'LETHAL'
                              ? 'bg-orange-950 border-orange-500 text-orange-300'
                              : 'bg-yellow-950 border-yellow-500 text-yellow-300'
                          }`}>
                            {bounty.difficulty}
                          </span>
                        </div>
                        <span className="text-[7px] text-slate-400 font-vt">
                          Sector Origin: {bounty.sectorName}
                        </span>
                      </div>
                    </div>

                    {isCleared ? (
                      <span className="text-[7.5px] px-2 py-1 rounded bg-emerald-950 border border-emerald-500 text-emerald-300 font-bold">
                        ✓ TARGET ELIMINATED
                      </span>
                    ) : (
                      <button
                        onClick={() => launchBounty(bounty)}
                        className="pixel-btn bg-rose-600 hover:bg-rose-500 text-white text-[8px] px-3 py-1.5 font-bold animate-pulse"
                      >
                        HUNT TARGET ▶
                      </button>
                    )}
                  </div>

                  <p className="text-[7.5px] text-slate-300 font-vt leading-relaxed">{bounty.description}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[7px] bg-black/50 p-2 rounded-lg">
                    <div>
                      <span className="text-slate-400">THREAT ANALYSIS:</span>
                      <div className="text-red-400 font-bold">{bounty.threat}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">KNOWN WEAKNESS:</span>
                      <div className="text-cyan-400 font-bold">{bounty.weakness}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">BOUNTY PAYOUT:</span>
                      <div className="text-yellow-400 font-bold">
                        +{bounty.rewardCoins}c & {bounty.rewardScrap.count}x {bounty.rewardScrap.name}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW: ORACLE 404 - HEX RELIQUARY TERMINAL */}
      {viewMode === 'oracle' && (
        <div className="flex-1 p-5 flex flex-col justify-center items-center bg-black select-none relative overflow-hidden">
          <div className="w-full max-w-lg p-5 rounded-2xl border-2 border-cyan-500/80 bg-slate-950/95 shadow-2xl flex flex-col gap-3 relative">
            <div className="flex justify-between items-center border-b border-cyan-500/30 pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔮</span>
                <div>
                  <h2 className="text-[11px] font-bold text-cyan-400">ORACLE 404: QUANTUM CRYPTOGRAPHY TERMINAL</h2>
                  <span className="text-[7px] text-slate-400 font-vt">DR. KELVIN'S RELIQUARY CHECKSUM</span>
                </div>
              </div>
              <button
                onClick={() => { setViewMode('dungeon_map'); audio.playBeep(); }}
                className="text-[7.5px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700"
              >
                ◀ EXIT TERMINAL
              </button>
            </div>

            <div className="p-3 rounded-lg bg-black/80 border border-slate-800 text-[8px] text-slate-300 font-mono leading-relaxed">
              <p className="text-cyan-300 mb-1">&gt; INITIATING SECURE HANDSHAKE WITH DR. KELVIN'S VAULT...</p>
              <p className="text-yellow-300 font-bold text-[9px] mb-2">
                "{activeNpcNode?.riddleQuestion || 'Which primordial protocol current grounds all erratic electrical oscillations across Aethel-Net?'}"
              </p>
              <p className="text-[7px] text-slate-400">Select the correct protocol checksum to release the cache locks:</p>
            </div>

            {oracleError && (
              <div className="p-2 rounded bg-red-950/80 border border-red-500 text-red-300 text-[7.5px] font-bold text-center">
                ⚠️ {oracleError}
              </div>
            )}

            {oracleRiddleSolved ? (
              <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-500 flex flex-col items-center gap-2 text-center animate-fade-in">
                <div className="text-2xl">✨🔓</div>
                <h3 className="text-[10px] font-bold text-emerald-300">CHECKSUM VERIFIED: VAULT UNLOCKED!</h3>
                <p className="text-[8px] text-yellow-300 font-vt">
                  Salvaged +2 Quantum Nanotubes, +2 Germanium Transistors, +2 Overclock Quartz & +150 Data-Coins!
                </p>
                <button
                  onClick={() => {
                    setCurrentNodeIndex((prev) => Math.min(selectedSector.nodes.length - 1, prev + 1));
                    setViewMode('dungeon_map');
                  }}
                  className="pixel-btn bg-emerald-500 text-black text-[8px] px-4 py-1.5 font-bold"
                >
                  COLLECT & PROCEED ▶
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {(activeNpcNode?.riddleOptions || [
                  { text: 'A. Protocol Zero: Absolute Zero Signal Nullification', isCorrect: false },
                  { text: 'B. The Carrier Wave: Continuous Resonant Grid Harmonics', isCorrect: true },
                  { text: 'C. Hegemony Master Clock: Synchronized Central Execution', isCorrect: false },
                  { text: 'D. The Clock Cycle: 60Hz Oscillating Quartz Pulse', isCorrect: false },
                ]).map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSolveOracle(opt.isCorrect)}
                    className="p-2.5 rounded-lg border border-slate-700 bg-slate-900/90 hover:border-cyan-400 hover:bg-slate-800 text-left text-[8px] text-slate-200 transition-colors flex items-center justify-between"
                  >
                    <span>{opt.text}</span>
                    <span className="text-[6.5px] text-slate-400 font-vt">TRANSMIT ▶</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
