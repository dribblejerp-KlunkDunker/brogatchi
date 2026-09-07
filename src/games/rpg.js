import { GameBase, VIEW_W, VIEW_H } from './GameBase.js';
import { drawSprite } from './pixel.js';
import { RYAN_RPG, ZEKE_RPG, CHAD_RPG, DRONE_RPG, AGENT_RPG } from './sprites.js';

// Final Bro-tasy — PLAYER-controlled tactical RPG. No more screensaver:
// select a hero (tap portrait), and when their ATB gauge fills, command
// ATTACK / FOCUS / GUARD / ULTIMATE from the bottom bar. Tap an enemy to
// re-target them. The Agent shifts to phase 2 at half HP.

const HERO_DEF = [
  { name: 'RYAN', role: 'DPS',  sprite: RYAN_RPG, maxHp: 140, atk: 26, def: 5, spd: 2.0, x: 96, y: 396 },
  { name: 'CHAD', role: 'TANK', sprite: CHAD_RPG, maxHp: 230, atk: 16, def: 14, spd: 1.45, x: 152, y: 422 },
  { name: 'ZEKE', role: 'HACK', sprite: ZEKE_RPG, maxHp: 90, atk: 44, def: 3, spd: 1.95, x: 44, y: 430 },
];

const ENEMY_DEF = [
  { name: 'FED DRONE', sprite: DRONE_RPG, maxHp: 160, atk: 18, def: 4, spd: 2.5, x: 300, y: 356 },
  { name: 'AGENT 01', sprite: AGENT_RPG, maxHp: 300, atk: 24, def: 9, spd: 2.8, x: 246, y: 410 },
];

const STORY = [
  { name: 'RYAN', color: '#38bdf8', text: 'The feds are throttling our frames. Not today.' },
  { name: 'ZEKE', color: '#a855f7', text: "Firewall's down. Tap a hero, then hit ATTACK when their gauge fills. Guard when the Agent glows." },
  { name: 'CHAD', color: '#eab308', text: 'I hold the line. You press the red buttons. Simple plan. I believe in us.' },
];

export class RPGGame extends GameBase {
  constructor(...args) {
    super(...args);
    this.key = 'rpg';
  }

  setup() {
    this.phase = 'story'; // story | combat | victory
    this.storyIdx = 0;
    this.selected = 0;
    this.sweepCooldown = 0;
    this.heroes = HERO_DEF.map((d, i) => this.makeUnit(d, true, i));
    this.enemies = ENEMY_DEF.map((d) => this.makeUnit(d, false));
  }

  makeUnit(def, isHero) {
    return {
      ...def,
      isHero,
      hp: def.maxHp,
      atb: 15 + Math.random() * 35,
      limit: 0,
      buff: 0,       // FOCUS stacks
      guarding: false,
      target: null,  // current target
      act: 0,        // action timer (seconds)
      actType: null,
      actedFx: true, // whether the impact FX already fired
      dead: false,
      startX: def.x,
      phase2: false,
      flash: 0,
    };
  }

  enemyHpTarget() {
    const alive = this.enemies.filter((e) => !e.dead);
    return alive[0] || null;
  }

  // ---------------------------------------------------------- input
  onPointer(x, y) {
    if (this.phase === 'story') {
      this.app.audio.playBeep();
      this.storyIdx++;
      if (this.storyIdx >= STORY.length) {
        this.phase = 'combat';
        this.app.audio.setVariant('rpg', 1);
      }
      return;
    }
    if (this.phase === 'victory') {
      this.app.onGameOver(this.key, this.computeScore(), this.computeReward());
      return;
    }

    // select hero (portraits at y = 10 + i*42)
    this.heroes.forEach((h, i) => {
      if (!h.dead && x > 6 && x < 44 && y > 8 + i * 42 && y < 8 + i * 42 + 36) {
        this.selected = i;
        this.app.audio.playBeep();
      }
    });

    // retarget enemy
    for (const e of this.enemies) {
      if (!e.dead && x > e.x - 6 && x < e.x + 40 && y > e.y - 6 && y < e.y + 34) {
        const { heroes } = this;
        const ready = heroes[this.selected];
        if (ready && !ready.dead) ready.target = e;
        this.app.audio.playBeep();
      }
    }

    // command bar
    if (y > 512 && y < 566) {
      const hero = this.heroes[this.selected];
      if (!hero || hero.dead || hero.atb < 100) return;
      if (x > 20 && x < 96 && y > 512 && y < 566) hero.actType = 'ATTACK', this.issue(hero);
      else if (x > 104 && x < 180) hero.actType = 'FOCUS', this.issue(hero);
      else if (x > 188 && x < 264) hero.actType = 'GUARD', this.issue(hero);
      else if (x > 272 && x < 384 && hero.limit >= 100) hero.actType = 'ULT', this.issue(hero);
    }
  }

  issue(hero) {
    if (!hero.target || hero.target.dead) hero.target = this.enemyHpTarget();
    if (!hero.target) return;
    hero.atb = 0;
    hero.act = 0.55;
    hero.actType = hero.actType || 'ATTACK';
    this.app.audio.playJump();
  }

  // ---------------------------------------------------------- update
  update(dt) {
    if (this.phase !== 'combat') return;

    const alliesAlive = this.heroes.some((h) => !h.dead);
    const foesAlive = this.enemies.some((e) => !e.dead);
    if (!foesAlive) {
      this.phase = 'victory';
      this.app.audio.setVariant('rpg', 1);
      this.app.audio.playWin();
      return;
    }
    if (!alliesAlive) {
      this.app.audio.playHit();
      this.gameOver(5);
      return;
    }

    if (this.sweepCooldown > 0) this.sweepCooldown -= dt;

    // -- tick ATB --
    for (const e of [...this.heroes, ...this.enemies]) {
      if (e.dead) continue;
      if (e.act > 0) { this.tickAction(e, dt); continue; }
      if (e.atb < 100) e.atb = Math.min(100, e.atb + e.spd * dt * 20);
    }

    // -- ready heroes WAIT for the player's command (no auto-pilot) --
    // -- enemy actions --
    if (this.sweepReady()) this.executeSweep();

    for (const e of this.enemies) {
      if (e.dead || e.atb < 100 || e.act > 0) continue;
      e.atb = 0;
      e.act = 0.55;
      e.actType = 'ATK';
      e.target = this.pickPartyTarget();
    }
  }

  sweepReady() {
    const agent = this.enemies[1];
    if (!agent || agent.dead || agent.atb < 100 || agent.act > 0) return false;
    return this.sweepCooldown <= 0 && agent.phase2;
  }

  executeSweep() {
    const agent = this.enemies[1];
    agent.atb = 0;
    agent.act = 0.6;
    agent.actType = 'SWEEP';
    agent.target = null;
    this.sweepCooldown = 7;
  }

  pickPartyTarget() {
    const party = this.heroes.filter((h) => !h.dead);
    const tank = party.find((h) => h.role === 'TANK');
    if (tank && Math.random() < 0.62) return tank;
    return party[Math.floor(Math.random() * party.length)] || null;
  }

  tickAction(e, dt) {
    const wasFx = e.actedFx;
    e.act -= dt;

    // dash toward target
    const tX = e.target && !e.target.dead ? e.target.x + (e.isHero ? -34 : 30) : e.startX;
    const prog = e.act > 0.28 ? (0.55 - e.act) / 0.27 : 1 - (0.28 - e.act) / 0.28;
    e.x = e.startX + (tX - e.startX) * Math.max(0, Math.min(1, prog));

    // impact at the half-way point
    if (e.act <= 0.28 && !wasFx) {
      e.actedFx = true;
      if (e.isHero) this.resolveHeroHit(e);
      else this.resolveEnemyHit(e);
    }

    if (e.act <= 0) {
      e.x = e.startX;
      e.actedFx = false;
      e.atb = 0;
      if (e.actType === 'GUARD' && e.isHero) e.guarding = true;
      else e.guarding = false;
      if (!['FOCUS', 'GUARD'].includes(e.actType)) e.buff = 0; // a real attack consumes focus
    }
  }

  resolveHeroHit(e) {
    const type = e.actType || 'ATTACK';
    const t = e.target;
    if (type === 'FOCUS') {
      e.buff = Math.min(2, e.buff + 1);
      e.limit = Math.min(100, e.limit + 14);
      this.floatText(e.x + 6, e.y - 20, 'FOCUS!', '#f472b6', 10);
      this.app.audio.playBeep();
      return;
    }
    if (type === 'GUARD') {
      e.guarding = true;
      this.floatText(e.x + 6, e.y - 20, 'GUARD UP', '#38bdf8', 10);
      this.app.audio.playBeep();
      return;
    }
    if (!t || t.dead) {
      // nothing left to hit
      return;
    }
    if (type === 'ULT') {
      this.damage(t, e, 3.4, 'ULT');
      this.enemies.forEach((o) => { if (o !== t && !o.dead) this.damage(o, e, 1.5, 'ULT'); });
    } else {
      this.damage(t, e, 1 + e.buff * 0.4, 'ATK');
    }
  }

  resolveEnemyHit(e) {
    if (e.actType === 'SWEEP') {
      this.heroes.forEach((h) => { if (!h.dead) this.damage(h, e, 0.8, 'SWEEP'); });
      return;
    }
    const t = e.target || this.pickPartyTarget();
    if (t) this.damage(t, e, 1, 'ATK');
  }

  damage(target, attacker, mult, kind) {
    if (target.dead) return;
    const base = attacker.atk + Math.random() * 6 - target.def * 0.5;
    const crit = kind === 'ULT' || Math.random() < 0.15;
    let dmg = Math.max(1, Math.round(base * mult));
    if (crit) dmg = Math.round(dmg * 1.7);
    if (target.guarding) dmg = Math.max(1, Math.round(dmg * 0.3));

    target.hp = Math.max(0, target.hp - dmg);
    target.flash = 1;

    const color = kind.includes('ULT') ? '#facc15' : kind === 'SWEEP' ? '#ef4444' : crit ? '#f97316' : '#fff';
    this.floatText(target.x + 8, target.y - 12, `-${dmg}${crit ? '!' : ''}`, color, 11);
    this.burst(target.x + 10, target.y + 14, color, kind === 'ULT' ? 14 : 6, kind === 'ULT' ? 190 : 110);
    if (kind === 'ULT') { this.addShake(14); this.app.audio.playLevelUp(); }
    else { this.addShake(3); this.app.audio.playHit(); }

    if (!target.isHero && attacker.isHero && kind === 'ATK') attacker.limit = Math.min(100, attacker.limit + 15);
    if (!target.isHero && attacker.isHero && kind === 'ULT') attacker.limit = 0;

    if (target.hp <= 0) {
      target.dead = true;
      this.app.audio.playEat();
      this.burst(target.x + 10, target.y + 14, '#94a3b8', 14, 200);
      this.addShake(8);
      if (target.name === 'AGENT 01') {
        this.floatText(target.x, target.y - 30, 'AGENT DOWN', '#ef4444', 12);
      }
    } else if (!target.isHero && target.name === 'AGENT 01' && target.hp < target.maxHp * 0.5 && !target.phase2) {
      target.phase2 = true;
      target.spd = Math.min(4, target.spd + 0.6);
      target.atk = Math.round(target.atk * 1.5);
      this.floatText(target.x + 4, target.y - 26, 'PHASE 2!', '#ef4444', 14);
      this.addShake(12);
      this.app.audio.playLevelUp();
      this.app.audio.setVariant('rpg', 2);
    }
  }

  // ---------------------------------------------------------- scoring
  computeScore() {
    const hpSum = this.heroes.reduce((s, h) => s + Math.max(0, h.hp), 0);
    const hpMax = this.heroes.reduce((s, h) => s + h.maxHp, 0);
    return Math.round(320 + 300 * (hpSum / hpMax));
  }

  computeReward() {
    return 100 + (this.computeScore() >= 520 ? 50 : 0);
  }

  // ---------------------------------------------------------- draw
  draw(ctx) {
    // bg
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#0b0118');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // synthwave sun with stripes
    const sun = ctx.createLinearGradient(0, 30, 0, 210);
    sun.addColorStop(0, '#ec4899');
    sun.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, 120, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b0118';
    for (let i = 0; i < 4; i++) ctx.fillRect(VIEW_W / 2 - 90, 130 + i * 14, 180, 4);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, 120, 52, 0, Math.PI * 2);
    ctx.fill();

    // perspective grid
    ctx.strokeStyle = 'rgba(56,189,248,0.22)';
    ctx.lineWidth = 2;
    const off = (this.time * 40) % 40;
    for (let i = -8; i < 9; i++) {
      ctx.beginPath();
      ctx.moveTo(VIEW_W / 2 + i * 60, 240);
      ctx.lineTo(VIEW_W / 2 + i * 140, VIEW_H);
      ctx.stroke();
    }
    for (let yy = 250; yy < VIEW_H; yy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, yy + off);
      ctx.lineTo(VIEW_W, yy + off);
      ctx.stroke();
    }

    if (this.phase === 'story') { this.drawStory(ctx); return; }
    if (this.phase === 'victory') { this.drawVictory(ctx); return; }

    // --- combat ---
    for (const e of [...this.heroes, ...this.enemies]) {
      if (e.dead) {
        ctx.globalAlpha = 0.15;
        drawSprite(ctx, e.sprite.r, e.sprite.p, e.x, e.y, { scale: 1.6, shadow: true });
        ctx.globalAlpha = 1;
        continue;
      }
      if (e.flash > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.9, e.flash);
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(ctx, e.sprite.r, e.sprite.p, e.x, e.y, { scale: 1.7, shadow: true });
        ctx.restore();
      }
      const bob = e.isHero ? Math.sin((this.time + e.x * 0.03) * 2.6) * 1.5 : 0;
      drawSprite(ctx, e.sprite.r, e.sprite.p, e.x, e.y + bob, { scale: 1.7, shadow: true });
      e.flash = Math.max(0, e.flash - 0.05);

      // hp bar
      ctx.fillStyle = '#000';
      ctx.fillRect(e.x - 4, e.y - 12, 48, 7);
      ctx.fillStyle = e.isHero ? '#22c55e' : '#ef4444';
      ctx.fillRect(e.x - 2, e.y - 10, 44 * (e.hp / e.maxHp), 5);

      // ATB arrow for ready units
      if (e.atb >= 100) {
        ctx.fillStyle = '#fde047';
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('▲', e.x + 16, e.y - 18);
      }
      ctx.textAlign = 'left';
    }

    // target reticle
    const hero = this.heroes[this.selected];
    if (hero && !hero.dead && hero.target && !hero.target.dead) {
      const t = hero.target;
      ctx.strokeStyle = '#f472b6';
      ctx.lineWidth = 3;
      ctx.strokeRect(t.x - 4, t.y - 4, 38, 34);
    }

    // portraits
    this.heroes.forEach((h, i) => {
      const by = 10 + i * 44;
      const sel = this.selected === i;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(4, by - 2, 44, 40);
      ctx.strokeStyle = sel ? '#fde047' : '#334155';
      ctx.lineWidth = sel ? 3 : 2;
      ctx.strokeRect(4, by - 2, 44, 40);
      if (!h.dead) drawSprite(ctx, h.sprite.r, h.sprite.p, 8, by + 4, { scale: 1.7, shadow: true });
      // name/hp
      ctx.fillStyle = sel ? '#fde047' : '#e2e8f0';
      ctx.font = '9px "Press Start 2P"';
      ctx.fillText(h.name, 54, by + 12);
      ctx.font = '12px "VT323"';
      ctx.fillStyle = h.dead ? '#ef4444' : '#94a3b8';
      ctx.fillText(`HP ${Math.max(0, Math.round(h.hp))}/${h.maxHp}`, 54, by + 27);
      // limit gauge
      ctx.fillStyle = '#000';
      ctx.fillRect(54, by + 33, 60, 4);
      ctx.fillStyle = h.limit >= 100 ? '#ef4444' : '#fbbf24';
      ctx.fillRect(54, by + 33, 60 * (h.limit / 100), 4);
    });

    // command bar
    this.drawCommandBar(ctx);
  }

  drawCommandBar(ctx) {
    const y = 512;
    ctx.fillStyle = 'rgba(2,6,23,0.94)';
    ctx.fillRect(0, y - 14, VIEW_W, 102);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, y - 14, VIEW_W, 102);

    const hero = this.heroes[this.selected];
    const ready = hero && !hero.dead && hero.atb >= 100;
    const cmds = [
      { label: 'ATTACK', x: 20, color: '#dc2626' },
      { label: 'FOCUS', x: 104, color: '#d946ef' },
      { label: 'GUARD', x: 188, color: '#0ea5e9' },
    ];
    ctx.textAlign = 'center';
    for (const c of cmds) {
      ctx.fillStyle = ready ? c.color : '#1e293b';
      ctx.fillRect(c.x, y, 76, 46);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.strokeRect(c.x, y, 76, 46);
      ctx.fillStyle = ready ? '#fff' : '#64748b';
      ctx.font = '8px "Press Start 2P"';
      ctx.fillText(c.label, c.x + 38, y + 28);
    }
    // ultimate
    const canUlt = hero && !hero.dead && hero.limit >= 100;
    ctx.fillStyle = canUlt ? '#f59e0b' : '#1e293b';
    ctx.fillRect(272, y, 104, 46);
    ctx.strokeStyle = canUlt ? '#fde047' : '#334155';
    ctx.lineWidth = 3;
    ctx.strokeRect(272, y, 104, 46);
    ctx.fillStyle = canUlt ? '#000' : '#64748b';
    ctx.font = '7px "Press Start 2P"';
    ctx.fillText('ULTIMATE', 324, y + 20);
    ctx.font = '11px "VT323"';
    ctx.fillText(canUlt ? 'MAX' : `${hero ? Math.round(hero.limit) : 0}%`, 324, y + 36);
    ctx.textAlign = 'left';

    // status line
    ctx.font = '13px "VT323"';
    ctx.fillStyle = '#94a3b8';
    const who = hero && !hero.dead
      ? `${hero.name}: ${hero.atb >= 100 ? 'READY — pick a move' : 'charging ' + Math.round(hero.atb) + '%'}`
      : 'pick a hero';
    ctx.fillText(who, 12, y + 80);
  }

  drawStory(ctx) {
    const d = STORY[Math.min(this.storyIdx, STORY.length - 1)];
    ctx.fillStyle = 'rgba(2,6,23,0.92)';
    ctx.fillRect(8, 320, VIEW_W - 16, 200);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 320, VIEW_W - 16, 200);

    ctx.fillStyle = d.color;
    ctx.font = 'bold 13px "Press Start 2P"';
    ctx.fillText(d.name, 20, 352);

    ctx.fillStyle = '#fff';
    ctx.font = '20px "VT323"';
    this.wrapText(ctx, d.text, 20, 384, VIEW_W - 40, 26);

    if (Math.floor(this.time * 3) % 2 === 0) {
      ctx.fillStyle = d.color;
      ctx.font = '18px "VT323"';
      ctx.fillText('▼ tap to continue', VIEW_W / 2 - 60, 494);
    }
  }

  drawVictory(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 30px "Press Start 2P"';
    ctx.fillText('VICTORY', VIEW_W / 2, VIEW_H / 2 - 20);
    ctx.fillStyle = '#fff';
    ctx.font = '13px "Press Start 2P"';
    ctx.fillText(`+${this.computeReward()} COINS`, VIEW_W / 2, VIEW_H / 2 + 20);
    if (Math.floor(this.time * 1.5) % 2 === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px "VT323"';
      ctx.fillText('tap to exit', VIEW_W / 2, VIEW_H / 2 + 60);
    }
    ctx.textAlign = 'left';
  }

  wrapText(ctx, text, x, y, maxW, lh) {
    let line = '';
    for (const word of text.split(' ')) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        line = word + ' ';
        y += lh;
      } else line = test;
    }
    ctx.fillText(line, x, y);
  }
}