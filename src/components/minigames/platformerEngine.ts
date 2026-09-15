import type { PetType } from '../../store';
import { drawPixelPet, type GameInputState, type MiniGameCallbacks, type Particle, type FloatingText } from './types';

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'ground' | 'solid' | '?' | 'brick';
  color: string;
  active?: boolean;
  springY?: number;
}

interface Enemy {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  alive: boolean;
  squashedTimer: number;
}

export class PlatformerEngine {
  private pet: PetType;
  private callbacks: MiniGameCallbacks;

  public score: number = 0;
  public lives: number = 3;
  public gameOver: boolean = false;
  public gameWon: boolean = false;

  // Player state
  private px: number = 60;
  private py: number = 420;
  private pw: number = 26;
  private ph: number = 32;
  private pvx: number = 0;
  private pvy: number = 0;
  private grounded: boolean = false;
  private facingRight: boolean = true;
  private invulnerableTimer: number = 0;
  private wonSlideTimer: number = 0;

  // "Game Feel" juice helpers
  private coyoteTimer: number = 0; // Grace period after walking off platform
  private jumpBufferTimer: number = 0; // Jump queued right before landing
  private lastJumpState: boolean = false;

  // World
  private camX: number = 0;
  private blocks: Block[] = [];
  private enemies: Enemy[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private tickCount: number = 0;

  private readonly GOAL_X = 2600;
  private readonly GOAL_Y = 160;
  private readonly GOAL_H = 390;
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

    this.px = 60;
    this.py = 420;
    this.pvx = 0;
    this.pvy = 0;
    this.grounded = false;
    this.facingRight = true;
    this.invulnerableTimer = 0;
    this.wonSlideTimer = 0;

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.lastJumpState = false;

    this.camX = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.tickCount = 0;

    this.initWorld();

    this.callbacks.onScoreUpdate(this.score);
    this.callbacks.onLivesUpdate(this.lives);
  }

  private initWorld() {
    this.blocks = [
      // Floor sections with pits
      { x: 0, y: 550, w: 750, h: 50, type: 'ground', color: '#15803d' },
      { x: 860, y: 550, w: 600, h: 50, type: 'ground', color: '#15803d' },
      { x: 1580, y: 550, w: 550, h: 50, type: 'ground', color: '#15803d' },
      { x: 2240, y: 550, w: 800, h: 50, type: 'ground', color: '#15803d' },

      // Pipes
      { x: 380, y: 470, w: 56, h: 80, type: 'solid', color: '#16a34a' },
      { x: 620, y: 430, w: 56, h: 120, type: 'solid', color: '#16a34a' },
      { x: 1100, y: 470, w: 56, h: 80, type: 'solid', color: '#16a34a' },
      { x: 1800, y: 440, w: 56, h: 110, type: 'solid', color: '#16a34a' },

      // Elevated platforms & Stairs
      { x: 1240, y: 490, w: 40, h: 60, type: 'solid', color: '#b91c1c' },
      { x: 1280, y: 440, w: 40, h: 110, type: 'solid', color: '#b91c1c' },
      { x: 1320, y: 390, w: 40, h: 160, type: 'solid', color: '#b91c1c' },

      // Question blocks & Bricks
      { x: 240, y: 410, w: 32, h: 32, type: '?', active: true, color: '#eab308' },
      { x: 320, y: 330, w: 32, h: 32, type: '?', active: true, color: '#eab308' },
      { x: 480, y: 390, w: 32, h: 32, type: 'brick', color: '#b91c1c' },
      { x: 512, y: 390, w: 32, h: 32, type: '?', active: true, color: '#eab308' },
      { x: 544, y: 390, w: 32, h: 32, type: 'brick', color: '#b91c1c' },

      { x: 960, y: 400, w: 32, h: 32, type: '?', active: true, color: '#eab308' },
      { x: 1020, y: 310, w: 32, h: 32, type: '?', active: true, color: '#eab308' },

      { x: 1960, y: 410, w: 32, h: 32, type: 'brick', color: '#b91c1c' },
      { x: 1992, y: 410, w: 32, h: 32, type: '?', active: true, color: '#eab308' },
      { x: 2024, y: 410, w: 32, h: 32, type: '?', active: true, color: '#eab308' },
      { x: 2056, y: 410, w: 32, h: 32, type: 'brick', color: '#b91c1c' },
    ];

    this.enemies = [
      { x: 480, y: 520, w: 26, h: 30, vx: -1.4, alive: true, squashedTimer: 0 },
      { x: 1020, y: 520, w: 26, h: 30, vx: 1.4, alive: true, squashedTimer: 0 },
      { x: 1420, y: 520, w: 26, h: 30, vx: -1.6, alive: true, squashedTimer: 0 },
      { x: 1900, y: 520, w: 26, h: 30, vx: 1.5, alive: true, squashedTimer: 0 },
      { x: 2350, y: 520, w: 26, h: 30, vx: -1.6, alive: true, squashedTimer: 0 },
    ];
  }

  public handleInput(input: GameInputState) {
    if (this.gameOver || this.gameWon) return;

    // Horizontal Movement
    const accel = 0.75;
    if (input.left) {
      this.pvx -= accel;
      this.facingRight = false;
    }
    if (input.right) {
      this.pvx += accel;
      this.facingRight = true;
    }

    // Jump Buffering: Queue jump if pressed
    const jumpPressed = (input.up || input.action) && !this.lastJumpState;
    if (jumpPressed) {
      this.jumpBufferTimer = 7; // 7 frames buffer
    }

    // Variable Jump Cut: Release jump early to cut upward arc
    if (!input.up && !input.action && this.pvy < -4) {
      this.pvy *= 0.55;
    }

    this.lastJumpState = input.up || input.action;
  }

  public update(dt: number) {
    if (this.gameOver) return;

    this.tickCount++;

    // Sub-steps for high precision
    const steps = Math.max(1, Math.min(3, Math.round(dt * 60)));
    for (let s = 0; s < steps; s++) {
      this.stepPhysics();
    }
  }

  private stepPhysics() {
    if (this.gameWon) {
      // Slide down pole
      if (this.py < 518) {
        this.py += 3.5;
      } else {
        this.wonSlideTimer++;
        if (this.wonSlideTimer === 40) {
          this.gameOver = true;
          this.callbacks.onGameOver(this.score + 50, Math.max(25, Math.floor(this.score / 5) + 50));
        }
      }
      return;
    }

    // Timers
    if (this.invulnerableTimer > 0) this.invulnerableTimer--;
    if (this.coyoteTimer > 0) this.coyoteTimer--;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer--;

    // Friction & Clamp
    this.pvx *= 0.84;
    this.pvx = Math.max(-6.5, Math.min(6.5, this.pvx));

    // Gravity
    this.pvy += 0.62;
    this.pvy = Math.min(this.pvy, 12.0);

    // Jump execution (Coyote Time + Jump Buffer)
    if (this.jumpBufferTimer > 0 && (this.grounded || this.coyoteTimer > 0)) {
      this.pvy = -12.4;
      this.grounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.callbacks.onSound('jump');

      // Jump dust puff
      for (let p = 0; p < 5; p++) {
        this.particles.push({
          x: this.px + this.pw / 2,
          y: this.py + this.ph,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 2,
          life: 0.6,
          maxLife: 0.6,
          color: '#cbd5e1',
          size: 3,
          type: 'dust',
        });
      }
    }

    // --- DECOUPLED COLLISION DETECTION (Solves Corner Snagging) ---

    // 1. Horizontal Motion & Collision
    this.px += this.pvx;
    for (const b of this.blocks) {
      if (this.checkAABB(this.px, this.py, this.pw, this.ph, b)) {
        if (this.pvx > 0) {
          this.px = b.x - this.pw;
          this.pvx = 0;
        } else if (this.pvx < 0) {
          this.px = b.x + b.w;
          this.pvx = 0;
        }
      }
    }

    // 2. Vertical Motion & Collision
    this.py += this.pvy;
    const wasGrounded = this.grounded;
    this.grounded = false;

    for (const b of this.blocks) {
      if (this.checkAABB(this.px, this.py, this.pw, this.ph, b)) {
        if (this.pvy > 0) {
          // Landing on top
          this.py = b.y - this.ph;
          this.pvy = 0;
          this.grounded = true;
        } else if (this.pvy < 0) {
          // Hit bottom of block
          this.py = b.y + b.h;
          this.pvy = 0;

          // Trigger block reaction
          this.hitBlock(b);
        }
      }
    }

    // Set coyote timer if just fell off
    if (wasGrounded && !this.grounded && this.pvy >= 0) {
      this.coyoteTimer = 6;
    }

    // Pit death check
    if (this.py > this.VIRTUAL_HEIGHT + 40) {
      this.handlePlayerDamage(true);
    }

    // Update Question block spring recoil
    for (const b of this.blocks) {
      if (b.springY) {
        b.springY += 0.8;
        if (b.springY >= 0) b.springY = 0;
      }
    }

    // Check 5G Goal Flagpole
    if (
      !this.gameWon &&
      this.px + this.pw >= this.GOAL_X &&
      this.px <= this.GOAL_X + 24 &&
      this.py + this.ph >= this.GOAL_Y
    ) {
      this.gameWon = true;
      this.px = this.GOAL_X - 6;
      this.pvx = 0;
      this.pvy = 0;
      this.callbacks.onSound('levelup');
      this.score += 150;
      this.callbacks.onScoreUpdate(this.score);

      this.floatingTexts.push({
        x: this.GOAL_X - 10,
        y: this.py - 20,
        text: '5G SECURED!',
        color: '#22c55e',
        life: 2,
        maxLife: 2,
        vy: -1,
        fontSize: 14,
      });
      return;
    }

    // Update Enemies & Stomp collisions
    this.updateEnemies();

    // Camera Tracking (Smooth Lerp with deadzone)
    const targetCamX = Math.max(0, this.px - this.VIRTUAL_WIDTH * 0.35);
    this.camX += (targetCamX - this.camX) * 0.12;

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

  private hitBlock(b: Block) {
    if (b.type === '?' && b.active) {
      b.active = false;
      b.color = '#78716c';
      b.springY = -8;
      this.score += 20;
      this.callbacks.onScoreUpdate(this.score);
      this.callbacks.onSound('coin');

      this.floatingTexts.push({
        x: b.x + 8,
        y: b.y - 25,
        text: '+20',
        color: '#facc15',
        life: 1,
        maxLife: 1,
        vy: -1.2,
        fontSize: 12,
      });

      // Gold coin popup particle
      this.particles.push({
        x: b.x + 10,
        y: b.y - 20,
        vx: 0,
        vy: -5,
        life: 0.8,
        maxLife: 0.8,
        color: '#facc15',
        size: 8,
        type: 'coin',
      });
    } else if (b.type === 'brick') {
      b.springY = -5;
      this.callbacks.onSound('hit');
    }
  }

  private updateEnemies() {
    for (const e of this.enemies) {
      if (!e.alive) continue;

      e.x += e.vx;

      // Enemy platform edge & block bump turnaround
      let onGround = false;
      for (const b of this.blocks) {
        if (this.checkAABB(e.x, e.y, e.w, e.h, b)) {
          if (e.y + e.h - 8 < b.y) {
            e.y = b.y - e.h;
            onGround = true;
          } else {
            e.vx *= -1;
          }
        }
      }
      if (!onGround && e.y > this.VIRTUAL_HEIGHT) e.alive = false;

      // Player vs Enemy Collision
      if (this.invulnerableTimer === 0 && !this.gameWon && this.checkAABB(this.px, this.py, this.pw, this.ph, e)) {
        // Stomp condition: player is falling and player bottom is above enemy top third
        if (this.pvy > 0 && this.py + this.ph - this.pvy <= e.y + 12) {
          // Stomped!
          e.alive = false;
          this.pvy = -9.2; // Stomp bounce
          this.score += 50;
          this.callbacks.onScoreUpdate(this.score);
          this.callbacks.onSound('stomp');

          this.floatingTexts.push({
            x: e.x,
            y: e.y - 15,
            text: '+50',
            color: '#22c55e',
            life: 1,
            maxLife: 1,
            vy: -1,
            fontSize: 12,
          });

          // Squash poof
          for (let p = 0; p < 8; p++) {
            this.particles.push({
              x: e.x + e.w / 2,
              y: e.y + e.h / 2,
              vx: (Math.random() - 0.5) * 6,
              vy: (Math.random() - 0.5) * 4,
              life: 0.8,
              maxLife: 0.8,
              color: '#94a3b8',
              size: 4,
              type: 'smoke',
            });
          }
        } else {
          // Player hurt
          this.handlePlayerDamage();
        }
      }
    }
  }

  private handlePlayerDamage(instantFall: boolean = false) {
    this.callbacks.onSound('hit');
    this.lives--;
    this.callbacks.onLivesUpdate(this.lives);

    if (this.lives <= 0 || instantFall) {
      this.gameOver = true;
      const reward = Math.max(10, Math.floor(this.score / 6));
      this.callbacks.onGameOver(this.score, reward);
    } else {
      this.invulnerableTimer = 75; // ~1.25s
      this.pvy = -6;
      this.pvx = this.facingRight ? -4 : 4;
    }
  }

  private checkAABB(
    x1: number,
    y1: number,
    w1: number,
    h1: number,
    r2: { x: number; y: number; w: number; h: number }
  ): boolean {
    return x1 < r2.x + r2.w && x1 + w1 > r2.x && y1 < r2.y + r2.h && y1 + h1 > r2.y;
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // 1. Sky Gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, this.VIRTUAL_HEIGHT);
    skyGrad.addColorStop(0, '#0284c7');
    skyGrad.addColorStop(0.7, '#38bdf8');
    skyGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);

    // Apply Camera Translation
    ctx.translate(-Math.floor(this.camX), 0);

    // 2. Parallax Fluffy Clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    for (let c = 0; c < 12; c++) {
      const cx = 100 + c * 320;
      const cy = 80 + (c % 3) * 45;
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.arc(cx + 20, cy - 10, 26, 0, Math.PI * 2);
      ctx.arc(cx + 42, cy, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Blocks
    this.blocks.forEach((b) => {
      const drawY = b.y + (b.springY || 0);

      if (b.type === 'ground') {
        // Dirt Body
        ctx.fillStyle = '#78350f';
        ctx.fillRect(b.x, drawY, b.w, b.h);
        // Grass Top
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(b.x, drawY, b.w, 12);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(b.x, drawY, b.w, 3);
      } else if (b.type === 'solid') {
        // Pipe Style
        ctx.fillStyle = '#15803d';
        ctx.fillRect(b.x, drawY, b.w, b.h);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(b.x + 6, drawY, 8, b.h);
        ctx.fillStyle = '#14532d';
        ctx.fillRect(b.x + b.w - 10, drawY, 8, b.h);
        ctx.strokeStyle = '#052e16';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x, drawY, b.w, b.h);
      } else if (b.type === '?' && b.active) {
        // Question Box
        ctx.fillStyle = '#eab308';
        ctx.fillRect(b.x, drawY, b.w, b.h);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(b.x, drawY, b.w, 3);
        ctx.fillRect(b.x, drawY, 3, b.h);
        ctx.fillStyle = '#854d0e';
        ctx.fillRect(b.x, drawY + b.h - 3, b.w, 3);
        ctx.fillRect(b.x + b.w - 3, drawY, 3, b.h);

        // Question mark
        ctx.fillStyle = '#713f12';
        ctx.font = 'bold 16px "Press Start 2P", monospace';
        ctx.fillText('?', b.x + 8, drawY + 23);
      } else if (b.type === '?' && !b.active) {
        // Hit Metal Box
        ctx.fillStyle = '#64748b';
        ctx.fillRect(b.x, drawY, b.w, b.h);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(b.x, drawY, b.w, 2);
        ctx.fillRect(b.x, drawY, 2, b.h);
        ctx.fillStyle = '#334155';
        ctx.fillRect(b.x, drawY + b.h - 2, b.w, 2);
      } else if (b.type === 'brick') {
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(b.x, drawY, b.w, b.h);
        ctx.fillStyle = '#f87171';
        ctx.fillRect(b.x, drawY, b.w, 2);
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(b.x, drawY + b.h - 2, b.w, 2);
        // Mortar lines
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(b.x, drawY + b.h / 2, b.w, 2);
        ctx.fillRect(b.x + 8, drawY, 2, b.h / 2);
        ctx.fillRect(b.x + 22, drawY + b.h / 2, 2, b.h / 2);
      }
    });

    // 4. Draw Enemies (Reptilian MIB Agents)
    this.enemies.forEach((e) => {
      if (!e.alive) return;

      // Body (Suit)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(e.x, e.y + 10, e.w, e.h - 10);
      // Red Tie
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(e.x + e.w / 2 - 2, e.y + 11, 4, 8);
      // Reptilian Green Head
      ctx.fillStyle = '#15803d';
      ctx.fillRect(e.x + 3, e.y, e.w - 6, 11);
      // Shades
      ctx.fillStyle = '#000000';
      const dirOffset = e.vx > 0 ? 8 : 2;
      ctx.fillRect(e.x + dirOffset, e.y + 3, 10, 4);

      // Walking legs
      const legBob = Math.floor(this.tickCount / 6) % 2 === 0 ? 4 : 0;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(e.x + 4, e.y + e.h - 4 + (e.vx > 0 ? legBob : 0), 5, 4);
      ctx.fillRect(e.x + e.w - 9, e.y + e.h - 4 + (e.vx < 0 ? legBob : 0), 5, 4);
    });

    // 5. Draw 5G Goal Flagpole & Orb
    ctx.fillStyle = '#475569';
    ctx.fillRect(this.GOAL_X, this.GOAL_Y, 12, this.GOAL_H);
    // Metal Cross Lattices
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    for (let i = 0; i < this.GOAL_H; i += 24) {
      ctx.beginPath();
      ctx.moveTo(this.GOAL_X - 8, this.GOAL_Y + i);
      ctx.lineTo(this.GOAL_X + 20, this.GOAL_Y + i + 14);
      ctx.stroke();
    }

    // Glowing 5G Transmitter Orb
    const pulse = Math.abs(Math.sin(this.tickCount * 0.12)) * 8;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(this.GOAL_X + 6, this.GOAL_Y - 8, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.beginPath();
    ctx.arc(this.GOAL_X + 6, this.GOAL_Y - 8, 18 + pulse, 0, Math.PI * 2);
    ctx.fill();

    // 6. Draw Player (Bro'gatchi Pet with Run / Jump animations)
    const isInvuln = this.invulnerableTimer > 0;
    drawPixelPet(
      ctx,
      this.pet,
      this.px,
      this.py,
      this.pw,
      this.ph,
      this.facingRight,
      this.tickCount,
      isInvuln
    );

    // 7. Draw Particles
    this.particles.forEach((pt) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      if (pt.type === 'coin') {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      }
      ctx.restore();
    });

    // 8. Draw Floating Text Popups
    this.floatingTexts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = `bold ${ft.fontSize || 12}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#000';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    ctx.restore();
  }
}
