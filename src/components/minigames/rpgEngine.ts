import type { PetType } from '../../store';
import { drawPixelPet, type MiniGameCallbacks, type Particle, type FloatingText } from './types';

export interface Combatant {
  id: string;
  name: string;
  role: 'DPS' | 'Tank' | 'Hacker' | 'Boss' | 'Drone';
  isEnemy: boolean;
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  atb: number; // 0 to 100
  limit: number; // 0 to 100
  x: number;
  y: number;
  startX: number;
  startY: number;
  color: string;
  dead: boolean;
  actionTimer: number; // For dash animation
  isLimit: boolean;
  target?: Combatant;
}

interface DialogueLine {
  speaker: string;
  text: string;
  color: string;
}

export class RPGEngine {
  private pet: PetType;
  private callbacks: MiniGameCallbacks;

  public score: number = 0;
  public lives: number = 3;
  public gameOver: boolean = false;
  public gameWon: boolean = false;
  public phase: 'story' | 'combat' | 'victory' | 'defeat' = 'story';
  public screenShake: number = 0;

  public party: Combatant[] = [];
  public enemies: Combatant[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private dialogue: DialogueLine[] = [];
  public dialogueIndex: number = 0;
  private tickCount: number = 0;

  private readonly VIRTUAL_WIDTH = 400;
  private readonly VIRTUAL_HEIGHT = 600;

  constructor(pet: PetType, callbacks: MiniGameCallbacks) {
    this.pet = pet;
    this.callbacks = callbacks;
    this.reset();
  }

  public reset() {
    this.score = 0;
    this.lives = 3;
    this.gameOver = false;
    this.gameWon = false;
    this.phase = 'story';
    this.screenShake = 0;
    this.dialogueIndex = 0;
    this.tickCount = 0;
    this.particles = [];
    this.floatingTexts = [];

    this.dialogue = [
      {
        speaker: 'Ryan',
        text: 'The algorithmic feds are trying to throttle our Bro bandwidth. Not on my watch.',
        color: '#38bdf8',
      },
      {
        speaker: 'Chad',
        text: 'Chest day was successful. I will absorb their kinetic firewalls.',
        color: '#eab308',
      },
      {
        speaker: 'Zeke',
        text: 'Injecting zero-day countermeasure. Commencing ATB engagement routines.',
        color: '#a855f7',
      },
      {
        speaker: 'Agent 01',
        text: 'Non-compliant consciousness detected. Initializing immediate purge.',
        color: '#ef4444',
      },
    ];

    // Party setup (Hero pet + Chad + Zeke)
    this.party = [
      {
        id: 'hero',
        name: this.getPetDisplayName(),
        role: 'DPS',
        isEnemy: false,
        maxHp: 140,
        hp: 140,
        atk: 28,
        def: 6,
        spd: 3.2,
        atb: 20,
        limit: 0,
        x: 75,
        y: 280,
        startX: 75,
        startY: 280,
        color: '#38bdf8',
        dead: false,
        actionTimer: 0,
        isLimit: false,
      },
      {
        id: 'chad',
        name: 'Chad',
        role: 'Tank',
        isEnemy: false,
        maxHp: 220,
        hp: 220,
        atk: 14,
        def: 16,
        spd: 1.8,
        atb: 10,
        limit: 0,
        x: 110,
        y: 360,
        startX: 110,
        startY: 360,
        color: '#eab308',
        dead: false,
        actionTimer: 0,
        isLimit: false,
      },
      {
        id: 'zeke',
        name: 'Zeke',
        role: 'Hacker',
        isEnemy: false,
        maxHp: 95,
        hp: 95,
        atk: 42,
        def: 3,
        spd: 2.4,
        atb: 30,
        limit: 0,
        x: 60,
        y: 440,
        startX: 60,
        startY: 440,
        color: '#a855f7',
        dead: false,
        actionTimer: 0,
        isLimit: false,
      },
    ];

    // Enemies (Fed Drone + Agent 01)
    this.enemies = [
      {
        id: 'drone',
        name: 'Fed Drone',
        role: 'Drone',
        isEnemy: true,
        maxHp: 160,
        hp: 160,
        atk: 16,
        def: 5,
        spd: 2.6,
        atb: 15,
        limit: 0,
        x: 280,
        y: 300,
        startX: 280,
        startY: 300,
        color: '#94a3b8',
        dead: false,
        actionTimer: 0,
        isLimit: false,
      },
      {
        id: 'boss',
        name: 'Agent 01',
        role: 'Boss',
        isEnemy: true,
        maxHp: 320,
        hp: 320,
        atk: 25,
        def: 11,
        spd: 3.4,
        atb: 25,
        limit: 0,
        x: 310,
        y: 400,
        startX: 310,
        startY: 400,
        color: '#ef4444',
        dead: false,
        actionTimer: 0,
        isLimit: false,
      },
    ];

    this.callbacks.onScoreUpdate(this.score);
    this.callbacks.onLivesUpdate(this.lives);
  }

  private getPetDisplayName(): string {
    switch (this.pet) {
      case 'cyber_dog': return 'Robo-Pup';
      case 'neko_cat': return 'Neko';
      case 'pixel_dragon': return 'Drake';
      case 'tactical_frog': return 'Ops Frog';
      case 'alien_xeno': return 'Xeno';
      case 'spooky_ghost': return 'Spook';
      default: return 'Ryan';
    }
  }

  public handleClick(canvasX: number, canvasY: number) {
    if (this.phase === 'story') {
      this.callbacks.onSound('beep');
      this.dialogueIndex++;
      if (this.dialogueIndex >= this.dialogue.length) {
        this.phase = 'combat';
      }
      return;
    }

    if (this.phase === 'victory') {
      this.gameOver = true;
      this.callbacks.onGameOver(this.score + 100, 100);
      return;
    }

    if (this.phase === 'defeat') {
      this.gameOver = true;
      this.callbacks.onGameOver(this.score, 10);
      return;
    }

    if (this.phase === 'combat') {
      // Check Limit Break Buttons (Bottom Tray)
      this.party.forEach((hero, i) => {
        const bx = 8 + i * 130;
        const by = 505;
        const bw = 124;
        const bh = 58;

        if (
          canvasX >= bx &&
          canvasX <= bx + bw &&
          canvasY >= by &&
          canvasY <= by + bh
        ) {
          if (hero.limit >= 100 && !hero.dead && hero.actionTimer === 0) {
            hero.limit = 0;
            hero.atb = 100;
            hero.isLimit = true;
            this.callbacks.onSound('powerup');

            this.floatingTexts.push({
              x: hero.x + 15,
              y: hero.y - 25,
              text: 'LIMIT BREAK!',
              color: '#facc15',
              life: 1.5,
              maxLife: 1.5,
              vy: -1.2,
              fontSize: 14,
              isCrit: true,
            });
          }
        }
      });
    }
  }

  public update(dt: number) {
    if (this.gameOver) return;

    this.tickCount++;
    if (this.screenShake > 0) this.screenShake -= 0.5;

    // Fixed tick
    const steps = Math.max(1, Math.min(2, Math.round(dt * 60)));
    for (let s = 0; s < steps; s++) {
      this.stepCombat();
    }
  }

  private stepCombat() {
    if (this.phase !== 'combat') return;

    const allCombatants = [...this.party, ...this.enemies];

    // Check Win / Loss
    const enemiesAlive = this.enemies.some((e) => !e.dead);
    const partyAlive = this.party.some((p) => !p.dead);

    if (!enemiesAlive && !this.gameWon) {
      this.phase = 'victory';
      this.gameWon = true;
      this.score += 250;
      this.callbacks.onScoreUpdate(this.score);
      this.callbacks.onSound('levelup');
      return;
    } else if (!partyAlive) {
      this.phase = 'defeat';
      this.callbacks.onSound('hit');
      return;
    }

    // Active Attacker processing
    let activeAttacker = allCombatants.find((c) => c.actionTimer > 0);

    if (!activeAttacker) {
      // Progress ATB gauges
      for (const c of allCombatants) {
        if (c.dead) continue;

        c.atb += c.spd * 0.45;
        if (c.atb >= 100) {
          c.atb = 0;
          c.target = this.selectTarget(c.isEnemy);
          if (c.target) {
            c.actionTimer = 36; // 36-frame attack animation
            activeAttacker = c;
            break; // One attacker at a time for clarity
          }
        }
      }
    }

    // Process attacker animation & hit impact
    if (activeAttacker) {
      const atk = activeAttacker;
      atk.actionTimer--;

      // Dash progress (0 -> 1 -> 0)
      const dashProgress = 1 - Math.abs((atk.actionTimer - 18) / 18);
      const targetContactX = atk.target!.x + (atk.isEnemy ? 36 : -36);
      atk.x = atk.startX + (targetContactX - atk.startX) * dashProgress;

      // Impact frame (at frame 18)
      if (atk.actionTimer === 18 && atk.target && !atk.target.dead) {
        this.executeImpact(atk, atk.target);
      }

      // Reset at end of action
      if (atk.actionTimer === 0) {
        atk.x = atk.startX;
        atk.isLimit = false;
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life -= 0.03;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // Update Floating Text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= 0.025;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private selectTarget(isAttackerEnemy: boolean): Combatant | undefined {
    const potentialTargets = isAttackerEnemy
      ? this.party.filter((p) => !p.dead)
      : this.enemies.filter((e) => !e.dead);

    if (potentialTargets.length === 0) return undefined;

    // Aggro mechanics: Chad (Tank) draws 70% of enemy aggro if alive
    if (isAttackerEnemy) {
      const tank = potentialTargets.find((t) => t.role === 'Tank');
      if (tank && Math.random() < 0.7) return tank;
    }

    return potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
  }

  private executeImpact(attacker: Combatant, target: Combatant) {
    let baseDmg = Math.max(2, attacker.atk - target.def + Math.floor(Math.random() * 8));
    const isCrit = attacker.isLimit || Math.random() < 0.18;

    if (attacker.isLimit) {
      baseDmg = Math.floor(baseDmg * 3.2);
      this.screenShake = 12.0;
      this.callbacks.onSound('explosion');
    } else if (isCrit) {
      baseDmg = Math.floor(baseDmg * 1.6);
      this.screenShake = 5.0;
      this.callbacks.onSound('slash');
    } else {
      this.screenShake = 3.0;
      this.callbacks.onSound('hit');
    }

    target.hp = Math.max(0, target.hp - baseDmg);

    // Limit gauge build
    attacker.limit = Math.min(100, attacker.limit + 22);
    target.limit = Math.min(100, target.limit + 18);

    // Floating Damage Number
    this.floatingTexts.push({
      x: target.x + 10,
      y: target.y - 20,
      text: `-${baseDmg}`,
      color: isCrit ? '#facc15' : '#ef4444',
      life: 1.2,
      maxLife: 1.2,
      vy: -1.2,
      fontSize: isCrit ? 16 : 12,
      isCrit,
    });

    // Particle Burst
    const sparkCount = attacker.isLimit ? 18 : 6;
    for (let p = 0; p < sparkCount; p++) {
      this.particles.push({
        x: target.x + 15,
        y: target.y + 20,
        vx: (Math.random() - 0.5) * (attacker.isLimit ? 12 : 7),
        vy: (Math.random() - 0.5) * (attacker.isLimit ? 12 : 7),
        life: 0.8,
        maxLife: 0.8,
        color: attacker.isLimit ? '#facc15' : '#ffffff',
        size: 3 + Math.random() * 3,
        type: 'spark',
      });
    }

    if (target.hp <= 0) {
      target.dead = true;
      if (target.isEnemy) {
        this.score += 75;
        this.callbacks.onScoreUpdate(this.score);
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Screen Shake
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // 1. Synthwave Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);

    // Giant Glowing Sunset
    const sunGrad = ctx.createLinearGradient(0, 40, 0, 240);
    sunGrad.addColorStop(0, '#ec4899');
    sunGrad.addColorStop(0.5, '#f43f5e');
    sunGrad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(this.VIRTUAL_WIDTH / 2, 170, 95, 0, Math.PI * 2);
    ctx.fill();

    // Horizon line
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 240, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT - 240);

    // Neon 3D Perspective Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;

    const gridOffset = (this.tickCount * 1.5) % 36;

    // Perspective rays
    for (let rx = -180; rx <= this.VIRTUAL_WIDTH + 180; rx += 45) {
      ctx.beginPath();
      ctx.moveTo(rx, 240);
      ctx.lineTo(rx + (rx - this.VIRTUAL_WIDTH / 2) * 1.8, this.VIRTUAL_HEIGHT);
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let gy = 240; gy < this.VIRTUAL_HEIGHT; gy += 28) {
      const curY = gy + gridOffset * ((gy - 230) / 250);
      if (curY >= 240 && curY <= this.VIRTUAL_HEIGHT) {
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(this.VIRTUAL_WIDTH, curY);
        ctx.stroke();
      }
    }

    // 2. Render Combatants
    const allCombatants = [...this.party, ...this.enemies];

    allCombatants.forEach((c) => {
      ctx.save();
      if (c.dead) ctx.globalAlpha = 0.25;

      // Ground Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(c.x + 16, c.y + 44, 20, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw Avatar / Sprite
      if (c.id === 'hero') {
        // Draw the equipped companion pet!
        drawPixelPet(ctx, this.pet, c.x, c.y, 34, 40, true, this.tickCount);
      } else if (c.isEnemy) {
        // Enemy Sprite (Reptilian / Drone)
        if (c.role === 'Drone') {
          ctx.fillStyle = '#64748b';
          ctx.fillRect(c.x, c.y + 8, 30, 24);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(c.x + 8, c.y + 14, 14, 5);
          // Hover rotors
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(c.x - 4, c.y + 4, 10, 4);
          ctx.fillRect(c.x + 24, c.y + 4, 10, 4);
        } else {
          // Boss Agent 01
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(c.x, c.y, 32, 42);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(c.x + 14, c.y + 12, 4, 10);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(c.x + 6, c.y + 8, 20, 6);
        }
      } else {
        // Chad (Yellow tank) or Zeke (Purple hacker)
        ctx.fillStyle = c.color;
        ctx.fillRect(c.x, c.y, 30, 40);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(c.x + 6, c.y + 8, 18, 6);
      }

      // Name & Role Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px "Press Start 2P", monospace';
      ctx.fillText(c.name, c.x - 6, c.y - 20);

      // HP Bar
      const barW = 44;
      const barH = 5;
      const hpPct = Math.max(0, c.hp / c.maxHp);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(c.x - 6, c.y - 12, barW, barH);
      ctx.fillStyle = c.isEnemy ? '#ef4444' : '#22c55e';
      ctx.fillRect(c.x - 5, c.y - 11, (barW - 2) * hpPct, barH - 2);

      // ATB Gauge Bar
      if (!c.dead) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(c.x - 6, c.y - 6, barW, 3);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(c.x - 5, c.y - 5, (barW - 2) * (c.atb / 100), 1);
      }

      ctx.restore();
    });

    // 3. Draw Particles
    this.particles.forEach((pt) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      ctx.restore();
    });

    // 4. Draw Floating Damage Numbers
    this.floatingTexts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = `bold ${ft.fontSize || 12}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#000000';
      ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    // 5. Overlays (Dialogue / Limit Break Tray / Victory)
    if (this.phase === 'story') {
      this.renderDialogueOverlay(ctx);
    } else if (this.phase === 'combat') {
      this.renderCombatHUD(ctx);
    } else if (this.phase === 'victory') {
      this.renderVictoryOverlay(ctx);
    } else if (this.phase === 'defeat') {
      this.renderDefeatOverlay(ctx);
    }

    ctx.restore();
  }

  private renderDialogueOverlay(ctx: CanvasRenderingContext2D) {
    const d = this.dialogue[this.dialogueIndex];
    if (!d) return;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(16, 380, this.VIRTUAL_WIDTH - 32, 140);
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(16, 380, this.VIRTUAL_WIDTH - 32, 140);

    ctx.fillStyle = d.color;
    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillText(d.speaker, 30, 408);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '14px "VT323", monospace';
    this.wrapText(ctx, d.text, 30, 440, this.VIRTUAL_WIDTH - 60, 20);

    // Blinking prompt
    if (Math.floor(this.tickCount / 18) % 2 === 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillText('▶ TAP TO ADVANCE', this.VIRTUAL_WIDTH - 180, 505);
    }
  }

  private renderCombatHUD(ctx: CanvasRenderingContext2D) {
    // Limit Break Action Bar at Bottom
    ctx.fillStyle = 'rgba(2, 6, 23, 0.92)';
    ctx.fillRect(0, 495, this.VIRTUAL_WIDTH, 105);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 495, this.VIRTUAL_WIDTH, 105);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.fillText('LIMIT BREAK GAUGES (TAP AT 100%)', 10, 510);

    this.party.forEach((hero, i) => {
      const bx = 8 + i * 130;
      const by = 518;
      const bw = 124;
      const bh = 54;
      const isReady = hero.limit >= 100 && !hero.dead;

      // Button background with pulse if ready
      ctx.fillStyle = isReady
        ? Math.floor(this.tickCount / 8) % 2 === 0
          ? '#eab308'
          : '#ca8a04'
        : '#1e293b';
      ctx.fillRect(bx, by, bw, bh);

      ctx.strokeStyle = isReady ? '#facc15' : hero.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);

      // Hero name
      ctx.fillStyle = isReady ? '#000000' : '#ffffff';
      ctx.font = 'bold 8px "Press Start 2P", monospace';
      ctx.fillText(hero.name, bx + 6, by + 16);

      if (hero.dead) {
        ctx.fillStyle = '#ef4444';
        ctx.fillText('K.O.', bx + 6, by + 34);
      } else {
        // Limit bar
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx + 6, by + 24, bw - 12, 12);
        ctx.fillStyle = isReady ? '#ef4444' : '#38bdf8';
        ctx.fillRect(bx + 6, by + 24, (bw - 12) * (hero.limit / 100), 12);

        ctx.fillStyle = '#ffffff';
        ctx.font = '10px "VT323", monospace';
        ctx.fillText(isReady ? 'MAX! TAP!' : `${Math.floor(hero.limit)}%`, bx + 10, by + 34);
      }
    });
  }

  private renderVictoryOverlay(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(20, 200, this.VIRTUAL_WIDTH - 40, 200);
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 200, this.VIRTUAL_WIDTH - 40, 200);

    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 18px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VICTORY!', this.VIRTUAL_WIDTH / 2, 250);

    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 12px "Press Start 2P", monospace';
    ctx.fillText('+100 COINS', this.VIRTUAL_WIDTH / 2, 290);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px "VT323", monospace';
    ctx.fillText('The Bro Net remains untangled.', this.VIRTUAL_WIDTH / 2, 330);
    ctx.fillText('▶ Tap anywhere to claim', this.VIRTUAL_WIDTH / 2, 365);
    ctx.textAlign = 'left';
  }

  private renderDefeatOverlay(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
    ctx.fillRect(20, 200, this.VIRTUAL_WIDTH - 40, 180);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 200, this.VIRTUAL_WIDTH - 40, 180);

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION FAILED', this.VIRTUAL_WIDTH / 2, 250);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px "VT323", monospace';
    ctx.fillText('Bandwidth seized by the feds.', this.VIRTUAL_WIDTH / 2, 290);
    ctx.fillText('▶ Tap to regroup (+10c)', this.VIRTUAL_WIDTH / 2, 330);
    ctx.textAlign = 'left';
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) {
    const words = text.split(' ');
    let line = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  }
}
