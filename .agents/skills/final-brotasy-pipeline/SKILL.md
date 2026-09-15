---
name: final-brotasy-pipeline
description: >-
  Pipeline automation, world building data schemas, balance simulation runbooks, and content deployment guides for Final Bro-tasy.
  Use when validating world data, running combat balance simulations, or authoring characters, lore, and encounters.
---

# Final Bro-tasy: Pipeline & Automation Manual

This skill documents the automated data pipeline, simulation test harness, and content authoring standards for **Final Bro-tasy**.

---

## 1. Pipeline Overview

The Final Bro-tasy pipeline consists of three core automated tools located in `scripts/brotasy-pipeline/`:

1. **`validate-world-data.ts`**:
   - Parses and validates all content schemas (`loreData.ts`, `characters.ts`, `enemies.ts`).
   - Ensures no dangling references, verifies unique IDs, checks that every enemy has an elemental affinity and drop table, and confirms all dialogue nodes link cleanly to active combat encounters.
2. **`simulate-combat-balance.ts`**:
   - Headless battle simulator executing thousands of algorithmic combat encounters across all Sectors and party rosters.
   - Calculates turn duration distributions, hero death rates, limit break trigger frequencies, and boss phase transitions to verify mathematical balance.
3. **`generate-world-bible.ts`**:
   - Automatically compiles all in-game lore, hero sheets, NPC bios, faction doctrines, bestiary entries, and elemental tables into a publication-ready World Building Bible.

---

## 2. Running Pipeline Scripts

Execute the pipeline via npm scripts from the `brogatchi-virtual-pet` directory:

```bash
# Validate lore, schemas, and story linkages
npx tsx scripts/brotasy-pipeline/validate-world-data.ts

# Run 1,000 automated battle balance simulations per sector
npx tsx scripts/brotasy-pipeline/simulate-combat-balance.ts

# Generate the complete consolidated World Building Bible artifact
npx tsx scripts/brotasy-pipeline/generate-world-bible.ts
```

---

## 3. World Building Schemas

### Character Schema (`RPGHero`)
```typescript
interface RPGHero {
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
  critRate: number; // 0.0 - 1.0
  atb: number; // 0 - 100
  limit: number; // 0 - 100
  color: string;
  skills: RPGSkill[];
  limitName: string;
  limitDesc: string;
  passiveName: string;
  passiveDesc: string;
  equippedRelicId?: string;
}
```

### Bestiary Schema (`RPGEnemy`)
```typescript
interface RPGEnemy {
  id: string;
  name: string;
  title: string;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  color: string;
  element: 'kinetic' | 'thermal' | 'cryo' | 'quantum' | 'glitch';
  coinReward: number;
  isBoss?: boolean;
  phases?: number;
  loreSnippet: string;
  specialSkillName?: string;
  telegraphMessage?: string;
}
```

---

## 4. Quality Checklist for New Additions
- [ ] Run `validate-world-data.ts` and verify 0 schema warnings.
- [ ] Run `simulate-combat-balance.ts` and ensure Sector win rate stays within target bounds ($70\% - 95\%$).
- [ ] Verify TypeScript types compile cleanly with `npm run build`.
- [ ] Verify responsive rendering on both mobile viewport ($400\text{px}$) and desktop displays.
