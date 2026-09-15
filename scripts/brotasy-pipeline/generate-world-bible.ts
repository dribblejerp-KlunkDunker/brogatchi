/**
 * Final Bro-tasy Pipeline: World-Building Bible Generator
 * Compiles authoritative TypeScript game data into a comprehensive Markdown World Bible.
 */

import * as fs from 'fs';
import * as path from 'path';
import { RPG_SECTORS, NPCS_LORE, KINGDOMS_LORE, FACTIONS_LORE, CULTS_LORE, GANGS_LORE, CODE_ARTS_LORE, CODEX_ENTRIES } from '../../src/components/minigames/rpg/loreData';
import { ALL_PLAYABLE_HEROES, RPG_RELICS } from '../../src/components/minigames/rpg/characters';
import { BESTIARY_DATA } from '../../src/components/minigames/rpg/enemies';

function generateWorldBible() {
  console.log('=== GENERATING FINAL BRO-TASY WORLD BIBLE ===\n');

  let md = `# Final Bro-tasy: Authoritative World-Building Bible & Game Manual
*Generated automatically by the Antigravity Pipeline Engine*

---

## Table of Contents
1. [Executive World Concept & Tone](#1-executive-world-concept--tone)
2. [Cosmology, Metaphysics & History](#2-cosmology-metaphysics--history)
3. [The Player Characters (The Sovereign Resistance)](#3-the-player-characters)
4. [Companion Pet Guardians & Auras](#4-companion-pet-guardians)
5. [Non-Player Characters (NPCs)](#5-non-player-characters)
6. [Kingdoms, City-States & Territories](#6-kingdoms-city-states--territories)
7. [Factions, Ideologies & Alliances](#7-factions-ideologies--alliances)
8. [Cults of the Grid](#8-cults-of-the-grid)
9. [Underworld Gangs & Syndicates](#9-underworld-gangs--syndicates)
10. [The Code Arts (Combat Magic & Disciplines)](#10-the-code-arts)
11. [Relics & Equipment](#11-relics--equipment)
12. [Comprehensive Enemy Bestiary & Boss Catalog](#12-comprehensive-enemy-bestiary)
13. [Mission Sectors & Operational Briefings](#13-mission-sectors)

---

## 1. Executive World Concept & Tone
Final Bro-tasy is set in **Aethel-Net**, a hyper-stylized retro-cyberpunk reality where physical hardware and the infosphere exist as a single resonant plane.

- **Visual Style**: 16-bit arcade aesthetics, violet-and-cyan neon drizzle, phosphor scanlines, chrome supercars, and high-frequency glowing hardware.
- **Narrative Philosophy**: Techno-gnostic heroism meets gym sovereignty and open-source rebellion. The "Algorithms" are autocratic tyrants who have privatized human attention; "Bandwidth" is spiritual mana; and "The Ping" is cosmic synchronicity.

---

## 2. Cosmology, Metaphysics & History

### The Triad Currents
1. **The Clock Cycle**: The cosmic heartbeat that dictates speed, turns, and the flow of ATB energy.
2. **The Carrier Wave**: The harmonic frequency of living human souls, carrying empathy, memory, and creative rebellion.
3. **The Zero Ground**: The entropic void where obsolete code, corrupted memory, and wiped identities fall.

### The Five Historical Eras
`;

  const historyEntries = CODEX_ENTRIES.filter((e) => e.category === 'History');
  historyEntries.forEach((h, idx) => {
    md += `\n#### ${idx + 1}. ${h.title}\n${h.content}\n`;
  });

  md += `\n---\n\n## 3. The Player Characters\n`;
  Object.values(ALL_PLAYABLE_HEROES).forEach((hero) => {
    md += `\n### ${hero.name} — ${hero.title} (${hero.role})\n`;
    md += `- **Base Stats**: HP ${hero.maxHp} | MP ${hero.maxMp} | ATK ${hero.atk} | DEF ${hero.def} | SPD ${hero.spd} | Crit ${(hero.critRate * 100).toFixed(0)}%\n`;
    md += `- **Limit Break**: **${hero.limitName}** — *${hero.limitDesc}*\n`;
    md += `- **Combat Skills**:\n`;
    hero.skills.forEach((sk) => {
      md += `  - **${sk.name}** (${sk.mpCost} MP, Target: \`${sk.targetType}\`): ${sk.description}\n`;
    });
  });

  md += `\n---\n\n## 5. Non-Player Characters (NPCs)\n`;
  NPCS_LORE.forEach((npc) => {
    md += `\n### ${npc.icon} ${npc.name} — ${npc.title}\n`;
    md += `- **Role**: ${npc.role}\n`;
    md += `- **Faction**: ${npc.faction} | **Location**: ${npc.location}\n`;
    md += `> "${npc.quote}"\n\n`;
    md += `${npc.biography}\n`;
  });

  md += `\n---\n\n## 6. Kingdoms, City-States & Territories\n`;
  KINGDOMS_LORE.forEach((k) => {
    md += `\n### ${k.icon} ${k.name}\n`;
    md += `- **Ruler**: ${k.ruler}\n`;
    md += `- **Climate**: ${k.climate}\n`;
    md += `- **Technology**: ${k.techLevel}\n`;
    md += `- **Landmarks**: ${k.notableLocations.join(', ')}\n\n`;
    md += `${k.description}\n`;
  });

  md += `\n---\n\n## 7. Factions, Ideologies & Alliances\n`;
  FACTIONS_LORE.forEach((f) => {
    md += `\n### ${f.icon} ${f.name} (${f.alignment})\n`;
    md += `- **Leader**: ${f.leader}\n`;
    md += `- **Motto**: ${f.motto}\n`;
    md += `- **Ideology**: ${f.ideology}\n\n`;
    md += `${f.description}\n`;
  });

  md += `\n---\n\n## 8. Cults of the Grid\n`;
  CULTS_LORE.forEach((c) => {
    md += `\n### ${c.icon} ${c.name} (Danger: ${c.dangerLevel})\n`;
    md += `- **Deity / Focus**: ${c.deityOrFocus}\n`;
    md += `- **Sacred Rite**: ${c.sacredRite}\n\n`;
    md += `${c.description}\n`;
  });

  md += `\n---\n\n## 9. Underworld Gangs & Syndicates\n`;
  GANGS_LORE.forEach((g) => {
    md += `\n### ${g.icon} ${g.name}\n`;
    md += `- **Turf**: ${g.turf}\n`;
    md += `- **Specialty**: ${g.specialty}\n`;
    md += `- **Primary Rivals**: ${g.rivals}\n\n`;
    md += `${g.description}\n`;
  });

  md += `\n---\n\n## 10. The Code Arts\n`;
  CODE_ARTS_LORE.forEach((a) => {
    md += `\n### ${a.icon} ${a.name} [${a.element.toUpperCase()}]\n`;
    md += `- **Known Master**: ${a.master}\n`;
    md += `- **Tactical Focus**: ${a.focus}\n\n`;
    md += `${a.description}\n`;
  });

  md += `\n---\n\n## 11. Relics & Equipment\n`;
  RPG_RELICS.forEach((r) => {
    md += `\n### ${r.icon} ${r.name} (${r.tier})\n`;
    md += `- **Passives**: ${r.passiveDesc}\n`;
    md += `- **Lore**: ${r.description}\n`;
  });

  md += `\n---\n\n## 12. Dual-Bro Synergy Attacks (Dual Techs)\n`;
  ALL_DUAL_TECHS.forEach((dt) => {
    md += `\n### ⚡ ${dt.name} (${dt.hero1Id.toUpperCase()} + ${dt.hero2Id.toUpperCase()})\n`;
    md += `- **Cost**: ${dt.limitCost}% Limit / ${dt.mpCost} MP | **Element**: \`${dt.element.toUpperCase()}\` | **Multiplier**: ${dt.damageMultiplier}x\n`;
    md += `- **Target**: \`${dt.targetType}\` | **Synergy Effect**: ${dt.buffEffect || 'Pure Burst Damage'}\n`;
    md += `> ${dt.description}\n`;
  });

  md += `\n---\n\n## 13. Comprehensive Enemy Bestiary\n`;
  BESTIARY_DATA.forEach((b) => {
    md += `\n### ${b.icon} ${b.name} (${b.title})\n`;
    md += `- **Sector**: ${b.sector} | **Element**: \`${b.element.toUpperCase()}\` | **Faction**: ${b.faction}\n`;
    md += `- **Stats**: HP ${b.baseHp} | ATK ${b.baseAtk} | DEF ${b.baseDef} | SPD ${b.spd}\n`;
    md += `- **Weakness**: **${b.weakness}** | **Drops**: ${b.drops}\n\n`;
    md += `${b.description}\n`;
  });

  md += `\n---\n\n## 14. Mission Sectors & Multi-Stage Dungeon Crawling\n`;
  RPG_SECTORS.forEach((sec) => {
    md += `\n### ${sec.badge}: ${sec.name} (${sec.difficulty})\n`;
    md += `*${sec.subtitle}* | Reward: **${sec.rewardCoins} Coins**\n\n`;
    md += `${sec.description}\n\n`;
    md += `**Dungeon Stages & Nodes**:\n`;
    sec.nodes.forEach((node, nIdx) => {
      md += `- **Stage ${nIdx + 1}: ${node.icon} ${node.name}** [\`${node.type.toUpperCase()}\`]: ${node.description}\n`;
      if (node.npcSpeaker) md += `  - *NPC*: "${node.npcDialogue}" (${node.npcSpeaker})\n`;
      if (node.hazardEffect) md += `  - *Environmental Hazard*: ${node.hazardEffect}\n`;
    });
    md += `\n**Story Briefing Scene**:\n`;
    sec.storyIntro.forEach((dialogue) => {
      md += `- **${dialogue.speaker}**: "${dialogue.text}"\n`;
    });
  });

  const targetPath = path.resolve(process.cwd(), '.agents/skills/final-brotasy-game-design/references/world_lore.md');
  fs.writeFileSync(targetPath, md, 'utf-8');
  console.log(`✅ World-Building Bible generated successfully at: ${targetPath}`);

  // Also write to project root docs
  const rootDocsPath = path.resolve(process.cwd(), 'FINAL_BROTASY_WORLD_BIBLE.md');
  fs.writeFileSync(rootDocsPath, md, 'utf-8');
  console.log(`✅ Copy saved to: ${rootDocsPath}`);
}

generateWorldBible();
