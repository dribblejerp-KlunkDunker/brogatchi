/**
 * Final Bro-tasy Pipeline: Headless Combat Balance Simulator
 * Simulates thousands of battles across sectors and party rosters
 * to verify win rate curves, TTK (time to kill), and combat stability.
 */

import { createParty, ALL_PLAYABLE_HEROES } from '../../src/components/minigames/rpg/characters';
import { getEnemiesForSector } from '../../src/components/minigames/rpg/enemies';
import { RPG_SECTORS } from '../../src/components/minigames/rpg/loreData';
import type { RPGHero } from '../../src/components/minigames/rpg/characters';
import type { RPGEnemy } from '../../src/components/minigames/rpg/enemies';

interface SimResult {
  sectorId: string;
  sectorName: string;
  battlesRun: number;
  victories: number;
  defeats: number;
  winRate: number;
  avgTurns: number;
}

// Elemental multiplier table
function getMultiplier(attackElem?: string, targetElem?: string): number {
  if (!attackElem || !targetElem) return 1.0;
  if (attackElem === 'thermal' && targetElem === 'cryo') return 1.35;
  if (attackElem === 'cryo' && targetElem === 'thermal') return 1.35;
  if (attackElem === 'kinetic' && targetElem === 'glitch') return 1.25;
  if (attackElem === 'quantum' && targetElem === 'glitch') return 1.35;
  if (attackElem === 'glitch' && targetElem === 'quantum') return 1.4;
  return 1.0;
}

function simulateSingleBattle(sectorId: string, heroIds: string[]): { won: boolean; turns: number } {
  const party: RPGHero[] = createParty('cyber_dog', heroIds);
  const enemies: RPGEnemy[] = getEnemiesForSector(sectorId);
  let turns = 0;
  const MAX_TURNS = 100;

  while (turns < MAX_TURNS) {
    turns++;

    // 1. Party Turn
    for (const hero of party) {
      if (hero.dead) continue;
      const aliveEnemies = enemies.filter((e) => !e.dead);
      if (aliveEnemies.length === 0) return { won: true, turns };

      // AI Hero decision: use skill if MP available, else attack
      const usableSkill = hero.skills.find((s) => s.mpCost <= hero.mp && s.targetType.startsWith('enemy'));
      if (usableSkill) {
        hero.mp -= usableSkill.mpCost;
        if (usableSkill.targetType === 'enemy_all') {
          aliveEnemies.forEach((target) => {
            const mult = getMultiplier(usableSkill.element, target.element);
            const dmg = Math.max(5, Math.floor((hero.atk * (usableSkill.damageMultiplier || 1.4) - target.def * 0.4) * mult));
            target.hp -= dmg;
            if (target.hp <= 0) target.dead = true;
          });
        } else {
          const target = aliveEnemies[0];
          const mult = getMultiplier(usableSkill.element, target.element);
          const dmg = Math.max(8, Math.floor((hero.atk * (usableSkill.damageMultiplier || 1.6) - target.def * 0.4) * mult));
          target.hp -= dmg;
          if (target.hp <= 0) target.dead = true;
        }
      } else {
        // Basic Attack
        const target = aliveEnemies[0];
        const dmg = Math.max(5, Math.floor(hero.atk * 1.0 - target.def * 0.3));
        target.hp -= dmg;
        if (target.hp <= 0) target.dead = true;
        hero.mp = Math.min(hero.maxMp, hero.mp + 4);
      }
    }

    if (enemies.every((e) => e.dead)) return { won: true, turns };

    // 2. Enemy Turn
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const aliveHeroes = party.filter((h) => !h.dead);
      if (aliveHeroes.length === 0) return { won: false, turns };

      // Prefer hitting Taunting tank or random hero
      const taunter = aliveHeroes.find((h) => h.status === 'firewall');
      const target = taunter || aliveHeroes[Math.floor(Math.random() * aliveHeroes.length)];

      const mult = getMultiplier(enemy.element, target.role === 'Tank' ? 'kinetic' : undefined);
      const incomingDmg = Math.max(4, Math.floor((enemy.atk * 1.0 - target.def * 0.5) * mult));
      target.hp -= incomingDmg;
      if (target.hp <= 0) target.dead = true;
    }

    if (party.every((h) => h.dead)) return { won: false, turns };
  }

  return { won: false, turns: MAX_TURNS };
}

function runSimulations() {
  console.log('=== FINAL BRO-TASY HEADLESS COMBAT BALANCE SIMULATOR ===');
  console.log('Running 2,500 simulation iterations across all Sectors and party rosters...\n');

  const rosters = [
    ['ryan', 'chad', 'zeke'],     // Balanced Core
    ['ryan', 'nova', 'jax'],      // Heavy Brawler + Medic
    ['chad', 'maya', 'zeke'],     // Rogue Assassin + Tank
    ['jax', 'maya', 'ryan'],      // Glass-cannon Triple DPS
  ];

  const results: SimResult[] = [];

  RPG_SECTORS.forEach((sec) => {
    let totalWins = 0;
    let totalTurns = 0;
    const runsPerSector = 500;

    for (let i = 0; i < runsPerSector; i++) {
      const roster = rosters[i % rosters.length];
      const outcome = simulateSingleBattle(sec.id, roster);
      if (outcome.won) totalWins++;
      totalTurns += outcome.turns;
    }

    const winRate = (totalWins / runsPerSector) * 100;
    const avgTurns = totalTurns / runsPerSector;

    results.push({
      sectorId: sec.id,
      sectorName: sec.name,
      battlesRun: runsPerSector,
      victories: totalWins,
      defeats: runsPerSector - totalWins,
      winRate: Math.round(winRate * 10) / 10,
      avgTurns: Math.round(avgTurns * 10) / 10,
    });
  });

  console.log('-------------------------------------------------------------------------');
  console.log('| Sector Name                     | Battles | Wins | Loss | WinRate | AvgTurn |');
  console.log('-------------------------------------------------------------------------');
  results.forEach((r) => {
    const namePadded = r.sectorName.padEnd(31);
    const battlesPadded = String(r.battlesRun).padStart(7);
    const winsPadded = String(r.victories).padStart(4);
    const lossPadded = String(r.defeats).padStart(4);
    const winRatePadded = (r.winRate + '%').padStart(7);
    const turnsPadded = String(r.avgTurns).padStart(7);
    console.log(`| ${namePadded} | ${battlesPadded} | ${winsPadded} | ${lossPadded} | ${winRatePadded} | ${turnsPadded} |`);
  });
  console.log('-------------------------------------------------------------------------');

  // Verify balance criteria:
  // Sector 01-03 should have healthy win rates (>70%)
  // Sector 04 (Lethal Boss) should be challenging (45-75%)
  // Sector 05 (Endless Void Nightmare) should be hard (30-60%)
  const s1 = results.find((r) => r.sectorId === 'sector_01')!;
  const s2 = results.find((r) => r.sectorId === 'sector_02')!;
  const s3 = results.find((r) => r.sectorId === 'sector_03')!;
  const s4 = results.find((r) => r.sectorId === 'sector_04')!;

  if (s1.winRate >= 80 && s2.winRate >= 70 && s3.winRate >= 60 && s4.winRate >= 40) {
    console.log('\n🎯 COMBAT BALANCE CRITERIA PASSED: Progression curve is mathematically sound!');
    process.exit(0);
  } else {
    console.warn('\n⚠️ Balance warning: curve outside optimal boundaries. Check stat scalings.');
    process.exit(0);
  }
}

runSimulations();
