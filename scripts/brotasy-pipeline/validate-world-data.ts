/**
 * Final Bro-tasy Pipeline: World Data & Model Validator
 * Ensures zero broken links, invalid references, missing stats, or unbalanced formulas.
 */

import { RPG_SECTORS, NPCS_LORE, KINGDOMS_LORE, FACTIONS_LORE, CULTS_LORE, GANGS_LORE, CODE_ARTS_LORE, CODEX_ENTRIES, ROGUE_BOUNTIES } from '../../src/components/minigames/rpg/loreData';
import { ALL_PLAYABLE_HEROES, RPG_RELICS, INITIAL_ITEMS, ALL_DUAL_TECHS, createParty, SCRAP_MATERIALS, RELIC_FORGE_RECIPES, HERO_TALENT_TREES } from '../../src/components/minigames/rpg/characters';
import { BESTIARY_DATA, getEnemiesForSector, getBountyEnemy } from '../../src/components/minigames/rpg/enemies';

function runValidation() {
  console.log('=== FINAL BRO-TASY WORLD DATA & PIPELINE VALIDATION ===\n');
  let errors: string[] = [];
  let warnings: string[] = [];

  // 1. Validate Sectors & Dungeon Nodes & Branching
  console.log(`[1/12] Validating ${RPG_SECTORS.length} Sectors & Branching Dungeon Nodes...`);
  RPG_SECTORS.forEach((sec) => {
    if (!sec.id || !sec.name || !sec.badge) errors.push(`Sector missing core fields: ${sec.id}`);
    if (sec.rewardCoins <= 0) warnings.push(`Sector ${sec.id} has non-positive rewardCoins`);
    if (!sec.storyIntro || sec.storyIntro.length === 0) errors.push(`Sector ${sec.id} has no story dialogue`);
    if (!sec.nodes || sec.nodes.length === 0) {
      errors.push(`Sector ${sec.id} has no dungeon nodes configured!`);
    } else {
      const nodeIds = new Set(sec.nodes.map((n) => n.id));
      sec.nodes.forEach((node) => {
        if (!node.id || !node.name || !node.type || !node.icon) {
          errors.push(`Node ${node.id} in sector ${sec.id} missing required fields`);
        }
        if (node.branches) {
          node.branches.forEach((b) => {
            if (!nodeIds.has(b.targetNodeId)) {
              errors.push(`Branch in node ${node.id} targets non-existent node: ${b.targetNodeId}`);
            }
          });
        }
      });
    }

    // Check if enemies exist for this sector
    const enemies = getEnemiesForSector(sec.id);
    if (enemies.length === 0) errors.push(`Sector ${sec.id} has no enemy encounters configured!`);
    const boss = enemies.find((e) => e.isBoss);
    if (!boss) warnings.push(`Sector ${sec.id} has no boss designated`);
  });

  // 2. Validate Playable Heroes
  const heroKeys = Object.keys(ALL_PLAYABLE_HEROES);
  console.log(`[2/12] Validating ${heroKeys.length} Playable Heroes...`);
  heroKeys.forEach((key) => {
    const hero = ALL_PLAYABLE_HEROES[key];
    if (hero.maxHp < 50 || hero.atk < 5 || hero.spd <= 0) {
      errors.push(`Hero ${hero.name} has invalid combat stats!`);
    }
    if (!hero.skills || hero.skills.length < 2) {
      warnings.push(`Hero ${hero.name} has fewer than 2 skills.`);
    }
    hero.skills.forEach((sk) => {
      if (!sk.id || !sk.name || sk.mpCost < 0) {
        errors.push(`Hero ${hero.name} skill ${sk.id} has invalid fields`);
      }
    });
    if (!hero.limitName || !hero.limitDesc) {
      errors.push(`Hero ${hero.name} missing limit break definition`);
    }
  });

  // 3. Validate Party Creation for all Pets
  console.log(`[3/12] Validating Party Creation across Pet Archetypes...`);
  const petTypes = ['cyber_dog', 'neko_cat', 'pixel_dragon', 'tactical_frog', 'alien_xeno', 'spooky_ghost', 'ryan'] as const;
  petTypes.forEach((pet) => {
    const party = createParty(pet, ['ryan', 'chad', 'zeke']);
    if (party.length !== 4) errors.push(`Party length for pet ${pet} is ${party.length}, expected 4`);
    if (party[0].id !== 'guardian') errors.push(`Guardian pet not in slot 0 for pet ${pet}`);
  });

  // 4. Validate Relics
  console.log(`[4/12] Validating ${RPG_RELICS.length} Relics...`);
  RPG_RELICS.forEach((r) => {
    if (!r.id || !r.name || !r.icon || !r.passiveDesc) {
      errors.push(`Relic ${r.id} missing required display data`);
    }
  });

  // 5. Validate Dual Techs
  console.log(`[5/12] Validating ${ALL_DUAL_TECHS.length} Dual-Bro Synergy Attacks (Dual Techs)...`);
  ALL_DUAL_TECHS.forEach((dt) => {
    if (!dt.id || !dt.name || !dt.hero1Id || !dt.hero2Id) {
      errors.push(`Dual Tech ${dt.id} missing hero linkage or name`);
    }
    if (dt.limitCost <= 0 || dt.mpCost <= 0 || dt.damageMultiplier <= 1.0) {
      errors.push(`Dual Tech ${dt.id} has invalid combat cost or multiplier`);
    }
  });

  // 6. Validate Bestiary & Sector Enemies
  console.log(`[6/12] Validating ${BESTIARY_DATA.length} Bestiary Records...`);
  BESTIARY_DATA.forEach((b) => {
    if (!b.id || !b.name || !b.element || !b.sector) {
      errors.push(`Bestiary entry ${b.id} missing required classification fields`);
    }
    if (b.baseHp <= 0 || b.baseAtk <= 0) {
      errors.push(`Bestiary entry ${b.id} has non-positive stats`);
    }
  });

  // 7. Validate Scrap Materials
  const scrapKeys = Object.keys(SCRAP_MATERIALS);
  console.log(`[7/12] Validating ${scrapKeys.length} Scrap Materials...`);
  scrapKeys.forEach((key) => {
    const s = SCRAP_MATERIALS[key];
    if (!s.id || !s.name || !s.icon || !s.description) {
      errors.push(`Scrap material ${key} missing required display data`);
    }
  });

  // 8. Validate Relic Forge Recipes
  console.log(`[8/12] Validating ${RELIC_FORGE_RECIPES.length} Relic Forge Recipes...`);
  RELIC_FORGE_RECIPES.forEach((rec) => {
    if (!rec.id || !rec.resultRelicId || !rec.materials || rec.materials.length === 0) {
      errors.push(`Forge recipe ${rec.id} missing result relic or material requirements`);
    }
    const relic = RPG_RELICS.find((r) => r.id === rec.resultRelicId);
    if (!relic) {
      errors.push(`Forge recipe ${rec.id} targets non-existent relic: ${rec.resultRelicId}`);
    }
    rec.materials.forEach((m) => {
      if (!SCRAP_MATERIALS[m.materialId]) {
        errors.push(`Forge recipe ${rec.id} requires unknown scrap material: ${m.materialId}`);
      }
    });
  });

  // 9. Validate Hero Talent Trees
  const talentHeroKeys = Object.keys(HERO_TALENT_TREES);
  console.log(`[9/12] Validating Hero Talent Trees across ${talentHeroKeys.length} Heroes...`);
  talentHeroKeys.forEach((heroId) => {
    const talents = HERO_TALENT_TREES[heroId];
    if (talents.length < 4) {
      warnings.push(`Hero ${heroId} has only ${talents.length} talents defined, expected >= 4`);
    }
    talents.forEach((t) => {
      if (!t.id || !t.name || !t.spec || !t.costCP) {
        errors.push(`Talent ${t.id} for hero ${heroId} missing required fields`);
      }
    });
  });

  // 10. Validate Rogue Bounties
  console.log(`[10/12] Validating ${ROGUE_BOUNTIES.length} Rogue Bounties...`);
  ROGUE_BOUNTIES.forEach((b) => {
    if (!b.id || !b.name || !b.enemyId || b.rewardCoins <= 0) {
      errors.push(`Rogue bounty ${b.id} missing core fields or non-positive coin reward`);
    }
    const enemies = getBountyEnemy(b.id);
    if (enemies.length === 0) {
      errors.push(`Rogue bounty ${b.id} has no enemy encounter returned by getBountyEnemy!`);
    }
  });

  // 11. Validate NPCs, Kingdoms, Factions, Cults, Gangs, Code Arts
  console.log(`[11/12] Validating World Lore Entities (NPCs: ${NPCS_LORE.length}, Kingdoms: ${KINGDOMS_LORE.length}, Factions: ${FACTIONS_LORE.length}, Cults: ${CULTS_LORE.length}, Gangs: ${GANGS_LORE.length}, Code Arts: ${CODE_ARTS_LORE.length})...`);
  NPCS_LORE.forEach((npc) => {
    if (!npc.name || !npc.quote || !npc.biography) errors.push(`NPC ${npc.id} missing biography or quote`);
  });
  KINGDOMS_LORE.forEach((k) => {
    if (!k.ruler || !k.description || k.notableLocations.length === 0) errors.push(`Kingdom ${k.id} missing ruler or landmarks`);
  });
  FACTIONS_LORE.forEach((f) => {
    if (!f.leader || !f.ideology || !f.motto) errors.push(`Faction ${f.id} missing lore attributes`);
  });
  CULTS_LORE.forEach((c) => {
    if (!c.deityOrFocus || !c.sacredRite) errors.push(`Cult ${c.id} missing sacred rite or deity`);
  });
  GANGS_LORE.forEach((g) => {
    if (!g.turf || !g.specialty) errors.push(`Gang ${g.id} missing turf or specialty`);
  });
  CODE_ARTS_LORE.forEach((a) => {
    if (!a.master || !a.focus) errors.push(`Code Art ${a.id} missing master or tactical focus`);
  });

  // 12. Validate Codex Entries & Consumables
  console.log(`[12/12] Validating ${CODEX_ENTRIES.length} Codex Entries & ${INITIAL_ITEMS.length} Consumables...`);
  if (CODEX_ENTRIES.length < 20) {
    warnings.push(`Unified Codex has ${CODEX_ENTRIES.length} entries, recommend >= 25 entries.`);
  }
  INITIAL_ITEMS.forEach((it) => {
    if (it.count <= 0) warnings.push(`Item ${it.id} initialized with zero count`);
  });

  console.log('\n----------------------------------------');
  if (errors.length === 0) {
    console.log(`✅ DATA INTEGRITY VERIFIED: 0 Errors, ${warnings.length} Warnings.`);
    if (warnings.length > 0) {
      warnings.forEach((w) => console.log(`   ⚠️ Warning: ${w}`));
    }
    process.exit(0);
  } else {
    console.error(`❌ VALIDATION FAILED: ${errors.length} Errors detected!`);
    errors.forEach((err) => console.error(`   - ${err}`));
    process.exit(1);
  }
}

runValidation();

