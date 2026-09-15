import type { PetType } from '../../store';
import { drawPixelPet, type GameInputState, type MiniGameCallbacks, type Particle, type FloatingText } from './types';

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  speed: number;
  isFireball: boolean;
}

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  color: string;
  active: boolean;
  points: number;
}

interface PowerUp {
  x: number;
  y: number;
  vy: number;
  type: 'W' | 'M' | 'S' | 'L' | 'F';
  color: string;
  active: boolean;
}

export class BreakerEngine {
  private pet: PetType;
  private callbacks: MiniGameCallbacks;

  public score: number = 0;
  public lives: number = 3;
  public level: number = 1;
  public gameOver: boolean = false;
  public screenShake: number = 0;

  // Paddle
  private paddleX: number = 150;
  private paddleY: number = 540;
  private paddleW: number = 84;
  private paddleH: number = 14;
  private paddleSquash: number = 0;

  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private powerups: PowerUp[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  private tickCount: number = 0;
  private slowMoTimer: number = 0;
  private fireballTimer: number = 0;

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
    this.level = 1;
    this.gameOver = false;
    this.screenShake = 0;
    this.paddleW = 84;
    this.paddleX = (this.VIRTUAL_WIDTH - this.paddleW) / 2;
    this.paddleSquash = 0;
    this.slowMoTimer = 0;
    this.fireballTimer = 0;
    this.powerups = [];
    this.particles = [];
    this.floatingTexts = [];
    this.tickCount = 0;

    this.callbacks.onScoreUpdate(this.score);
    this.callbacks.onLivesUpdate(this.lives);

    this.loadLevel(this.level);
  }

  public loadLevel(lvl: number) {
    this.level = lvl;
    this.bricks = [];
    this.powerups = [];

    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6'];
    const cols = 7;
    const brickW = 48;
    const brickH = 16;
    const startX = 28;
    const startY = 70;

    const rows = Math.min(7, 4 + Math.floor(lvl / 2));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Pattern variations per level
        if (lvl === 2 && (r + c) % 2 === 0) continue; // Checkerboard
        if (lvl === 3 && (c === 0 || c === cols - 1 || r === 0)) {
          // Fortified ring
        } else if (lvl === 3 && r > 2) {
          continue;
        }

        const isArmored = lvl >= 2 && r === 0;
        const hp = isArmored ? 2 : 1;
        const color = isArmored ? '#94a3b8' : colors[r % colors.length];

        this.bricks.push({
          x: startX + c * (brickW + 4),
          y: startY + r * (brickH + 4),
          w: brickW,
          h: brickH,
          hp,
          maxHp: hp,
          color,
          active: true,
          points: (rows - r) * 10 * lvl,
        });
      }
    }

    // Reset ball on paddle
    this.resetBall();
  }

  private resetBall() {
    const baseSpeed = 4.8 + Math.min(this.level * 0.4, 2.5);
    const angle = (Math.random() * 0.5 - 0.25) * Math.PI; // slight random vertical angle
    this.balls = [
      {
        x: this.paddleX + this.paddleW / 2,
        y: this.paddleY - 12,
        vx: baseSpeed * Math.sin(angle),
        vy: -baseSpeed * Math.cos(angle),
        radius: 6,
        speed: baseSpeed,
        isFireball: false,
      },
    ];
  }

  public handleInput(input: GameInputState) {
    if (this.gameOver) return;

    const moveSpeed = 6.5;
    if (input.left) {
      this.paddleX = Math.max(0, this.paddleX - moveSpeed);
    }
    if (input.right) {
      this.paddleX = Math.min(this.VIRTUAL_WIDTH - this.paddleW, this.paddleX + moveSpeed);
    }
  }

  public setPaddleTargetX(targetCenterX: number) {
    if (this.gameOver) return;
    this.paddleX = Math.max(0, Math.min(this.VIRTUAL_WIDTH - this.paddleW, targetCenterX - this.paddleW / 2));
  }

  public update(dt: number) {
    if (this.gameOver) return;

    this.tickCount++;

    if (this.screenShake > 0) this.screenShake -= 0.6;
    if (this.paddleSquash > 0) this.paddleSquash -= 0.1;

    if (this.slowMoTimer > 0) this.slowMoTimer--;
    if (this.fireballTimer > 0) this.fireballTimer--;

    // Sub-stepping for precise collision (2 steps)
    const substeps = 2;
    for (let s = 0; s < substeps; s++) {
      this.stepPhysics(dt / substeps);
    }
  }

  private stepPhysics(_dt: number) {
    // 1. Update Balls
    for (let bIdx = this.balls.length - 1; bIdx >= 0; bIdx--) {
      const ball = this.balls[bIdx];

      // Slow-mo speed modifier
      const speedMult = this.slowMoTimer > 0 ? 0.65 : 1.0;
      ball.x += ball.vx * speedMult;
      ball.y += ball.vy * speedMult;

      // Wall Collisions
      if (ball.x - ball.radius < 0) {
        ball.x = ball.radius;
        ball.vx = Math.abs(ball.vx);
        this.callbacks.onSound('beep');
      } else if (ball.x + ball.radius > this.VIRTUAL_WIDTH) {
        ball.x = this.VIRTUAL_WIDTH - ball.radius;
        ball.vx = -Math.abs(ball.vx);
        this.callbacks.onSound('beep');
      }

      if (ball.y - ball.radius < 0) {
        ball.y = ball.radius;
        ball.vy = Math.abs(ball.vy);
        this.callbacks.onSound('beep');
      }

      // Paddle Collision (Position-based angle deflection math)
      if (
        ball.vy > 0 &&
        ball.y + ball.radius >= this.paddleY &&
        ball.y - ball.radius <= this.paddleY + this.paddleH &&
        ball.x >= this.paddleX - ball.radius &&
        ball.x <= this.paddleX + this.paddleW + ball.radius
      ) {
        // Impact factor (-1 to +1)
        const paddleCenter = this.paddleX + this.paddleW / 2;
        const impactOffset = (ball.x - paddleCenter) / (this.paddleW / 2);
        const clampedOffset = Math.max(-0.95, Math.min(0.95, impactOffset));

        // Max bounce angle 60 degrees (pi/3)
        const bounceAngle = clampedOffset * (Math.PI / 3);
        const currentSpeed = ball.speed * (this.fireballTimer > 0 ? 1.15 : 1.0);

        // Compute vector preserving magnitude
        ball.vx = currentSpeed * Math.sin(bounceAngle);
        ball.vy = -currentSpeed * Math.cos(bounceAngle);

        // Ensure minimum vertical velocity so ball doesn't get trapped horizontally
        if (Math.abs(ball.vy) < 2.5) {
          ball.vy = -2.5;
        }

        this.paddleSquash = 1.0;
        this.callbacks.onSound('jump');

        // Paddle hit particles
        for (let p = 0; p < 6; p++) {
          this.particles.push({
            x: ball.x,
            y: this.paddleY,
            vx: (Math.random() - 0.5) * 6,
            vy: -Math.random() * 4,
            life: 1,
            maxLife: 1,
            color: '#38bdf8',
            size: 3,
            type: 'spark',
          });
        }
      }

      // Brick Collisions
      for (const brick of this.bricks) {
        if (!brick.active) continue;

        if (
          ball.x + ball.radius > brick.x &&
          ball.x - ball.radius < brick.x + brick.w &&
          ball.y + ball.radius > brick.y &&
          ball.y - ball.radius < brick.y + brick.h
        ) {
          // Brick hit!
          brick.hp--;

          if (!ball.isFireball && this.fireballTimer === 0) {
            // Determine bounce axis based on penetration depth
            const overlapLeft = ball.x + ball.radius - brick.x;
            const overlapRight = brick.x + brick.w - (ball.x - ball.radius);
            const overlapTop = ball.y + ball.radius - brick.y;
            const overlapBottom = brick.y + brick.h - (ball.y - ball.radius);

            const minOverlapX = Math.min(overlapLeft, overlapRight);
            const minOverlapY = Math.min(overlapTop, overlapBottom);

            if (minOverlapX < minOverlapY) {
              ball.vx = -ball.vx;
            } else {
              ball.vy = -ball.vy;
            }
          }

          if (brick.hp <= 0) {
            // Brick Destroyed!
            brick.active = false;
            this.score += brick.points;
            this.callbacks.onScoreUpdate(this.score);
            this.callbacks.onSound('eat');
            this.screenShake = 4.0;

            this.floatingTexts.push({
              x: brick.x + brick.w / 2,
              y: brick.y,
              text: `+${brick.points}`,
              color: brick.color,
              life: 1,
              maxLife: 1,
              vy: -1.0,
              fontSize: 12,
            });

            // Shard explosion
            for (let sp = 0; sp < 8; sp++) {
              this.particles.push({
                x: brick.x + brick.w / 2,
                y: brick.y + brick.h / 2,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 1,
                maxLife: 1,
                color: brick.color,
                size: 3 + Math.random() * 3,
                type: 'dust',
              });
            }

            // Powerup drop chance (15%)
            if (Math.random() < 0.15) {
              const types: ('W' | 'M' | 'S' | 'L' | 'F')[] = ['W', 'M', 'S', 'L', 'F'];
              const chosenType = types[Math.floor(Math.random() * types.length)];
              const pColors: Record<string, string> = {
                W: '#3b82f6', // Wide
                M: '#10b981', // Multi
                S: '#f59e0b', // Slow
                L: '#ef4444', // 1-Up
                F: '#ec4899', // Fireball
              };

              this.powerups.push({
                x: brick.x + brick.w / 2 - 12,
                y: brick.y,
                vy: 2.2,
                type: chosenType,
                color: pColors[chosenType],
                active: true,
              });
            }
          } else {
            // Brick Cracked
            brick.color = '#cbd5e1'; // damaged metal
            this.callbacks.onSound('hit');
            this.screenShake = 2.0;
          }

          break; // Hit one brick per sub-step
        }
      }

      // Ball Out of Bounds (Bottom)
      if (ball.y - ball.radius > this.VIRTUAL_HEIGHT) {
        this.balls.splice(bIdx, 1);
      }
    }

    // Check Life Loss
    if (this.balls.length === 0) {
      this.callbacks.onSound('hit');
      this.lives--;
      this.callbacks.onLivesUpdate(this.lives);

      if (this.lives <= 0) {
        this.gameOver = true;
        const reward = Math.max(10, Math.floor(this.score / 8));
        this.callbacks.onGameOver(this.score, reward);
        return;
      } else {
        this.resetBall();
      }
    }

    // 2. Update Power-ups
    for (let pIdx = this.powerups.length - 1; pIdx >= 0; pIdx--) {
      const pup = this.powerups[pIdx];
      pup.y += pup.vy;

      // Check paddle catch
      if (
        pup.y + 12 >= this.paddleY &&
        pup.y <= this.paddleY + this.paddleH &&
        pup.x + 24 >= this.paddleX &&
        pup.x <= this.paddleX + this.paddleW
      ) {
        this.activatePowerUp(pup.type);
        this.powerups.splice(pIdx, 1);
        continue;
      }

      if (pup.y > this.VIRTUAL_HEIGHT) {
        this.powerups.splice(pIdx, 1);
      }
    }

    // 3. Level Clear Check
    const activeBricks = this.bricks.filter((b) => b.active).length;
    if (activeBricks === 0) {
      this.callbacks.onSound('levelup');
      this.score += 200 * this.level;
      this.callbacks.onScoreUpdate(this.score);
      this.loadLevel(this.level + 1);
    }

    // 4. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life -= 0.03;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // 5. Update Floating Text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.life -= 0.025;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  private activatePowerUp(type: 'W' | 'M' | 'S' | 'L' | 'F') {
    this.callbacks.onSound('powerup');

    switch (type) {
      case 'W': // Wide Paddle
        this.paddleW = Math.min(140, this.paddleW + 28);
        this.floatingTexts.push({
          x: this.paddleX + this.paddleW / 2,
          y: this.paddleY - 20,
          text: 'WIDE PADDLE!',
          color: '#3b82f6',
          life: 1.2,
          maxLife: 1.2,
          vy: -1.2,
          fontSize: 12,
        });
        break;

      case 'M': // Multi-Ball
        if (this.balls.length > 0) {
          const src = this.balls[0];
          this.balls.push({
            x: src.x,
            y: src.y,
            vx: -src.vx,
            vy: src.vy - 0.5,
            radius: src.radius,
            speed: src.speed,
            isFireball: src.isFireball,
          });
          this.balls.push({
            x: src.x,
            y: src.y,
            vx: src.vx * 0.6,
            vy: src.vy + 0.8,
            radius: src.radius,
            speed: src.speed,
            isFireball: src.isFireball,
          });
        }
        this.floatingTexts.push({
          x: this.paddleX + this.paddleW / 2,
          y: this.paddleY - 20,
          text: 'MULTI-BALL!',
          color: '#10b981',
          life: 1.2,
          maxLife: 1.2,
          vy: -1.2,
          fontSize: 12,
        });
        break;

      case 'S': // Slow-Mo
        this.slowMoTimer = 400; // ~6.5s
        this.floatingTexts.push({
          x: this.paddleX + this.paddleW / 2,
          y: this.paddleY - 20,
          text: 'SLOW MOTION',
          color: '#f59e0b',
          life: 1.2,
          maxLife: 1.2,
          vy: -1.2,
          fontSize: 12,
        });
        break;

      case 'L': // 1-Up Heart
        this.lives = Math.min(5, this.lives + 1);
        this.callbacks.onLivesUpdate(this.lives);
        this.floatingTexts.push({
          x: this.paddleX + this.paddleW / 2,
          y: this.paddleY - 20,
          text: '+1 LIFE!',
          color: '#ef4444',
          life: 1.2,
          maxLife: 1.2,
          vy: -1.2,
          fontSize: 12,
        });
        break;

      case 'F': // Fireball piercing
        this.fireballTimer = 350; // ~5.8s
        this.floatingTexts.push({
          x: this.paddleX + this.paddleW / 2,
          y: this.paddleY - 20,
          text: 'FIREBALL!',
          color: '#ec4899',
          life: 1.2,
          maxLife: 1.2,
          vy: -1.2,
          fontSize: 12,
        });
        break;
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();

    // Screen Shake offset
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // 1. Dark Arcade Background with Neon Matrix Grid
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, this.VIRTUAL_WIDTH, this.VIRTUAL_HEIGHT);

    // Subtle Grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.VIRTUAL_WIDTH; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.VIRTUAL_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= this.VIRTUAL_HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.VIRTUAL_WIDTH, y);
      ctx.stroke();
    }

    // Watermark Level text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.font = 'bold 72px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LVL ${this.level}`, this.VIRTUAL_WIDTH / 2, 360);
    ctx.textAlign = 'left';

    // 2. Draw Bricks (3D Bevel look)
    this.bricks.forEach((b) => {
      if (!b.active) return;

      // Base
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // 3D Bevels
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(b.x, b.y, b.w, 2); // Top Highlight
      ctx.fillRect(b.x, b.y, 2, b.h); // Left Highlight

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2); // Bottom Shadow
      ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h); // Right Shadow

      // Crack lines if damaged
      if (b.hp < b.maxHp) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(b.x + 8, b.y + 2);
        ctx.lineTo(b.x + 18, b.y + b.h - 2);
        ctx.lineTo(b.x + 28, b.y + 4);
        ctx.stroke();
      }
    });

    // 3. Draw Power-Ups (Glowing Capsules)
    this.powerups.forEach((pup) => {
      ctx.save();
      // Glow
      ctx.shadowColor = pup.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = pup.color;
      ctx.fillRect(pup.x, pup.y, 24, 12);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pup.type, pup.x + 12, pup.y + 9);
      ctx.restore();
    });

    // 4. Draw Paddle with Squash & Bro'gatchi Mascot
    const squashScaleY = 1.0 - this.paddleSquash * 0.25;
    const squashScaleX = 1.0 + this.paddleSquash * 0.15;
    const paddleDrawW = this.paddleW * squashScaleX;
    const paddleDrawH = this.paddleH * squashScaleY;
    const paddleDrawX = this.paddleX - (paddleDrawW - this.paddleW) / 2;

    // Paddle Body
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(paddleDrawX, this.paddleY, paddleDrawW, paddleDrawH);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(paddleDrawX, this.paddleY, paddleDrawW, 3);
    ctx.fillStyle = '#0369a1';
    ctx.fillRect(paddleDrawX, this.paddleY + paddleDrawH - 3, paddleDrawW, 3);

    // Bro'gatchi Pet mini cheering mascot atop the paddle!
    drawPixelPet(ctx, this.pet, this.paddleX + this.paddleW / 2 - 12, this.paddleY - 26, 24, 24, true, this.tickCount);

    // 5. Draw Balls (Glowing / Fireball trails)
    const isFire = this.fireballTimer > 0;
    this.balls.forEach((ball) => {
      ctx.save();
      if (isFire) {
        ctx.shadowColor = '#ec4899';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#f43f5e';
      } else {
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#ffffff';
      }
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();

      // Fireball spark trail
      if (isFire && Math.random() < 0.5) {
        this.particles.push({
          x: ball.x,
          y: ball.y,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          life: 0.5,
          maxLife: 0.5,
          color: '#fbbf24',
          size: 3,
          type: 'spark',
        });
      }
      ctx.restore();
    });

    // 6. Draw Particles
    this.particles.forEach((pt) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      ctx.restore();
    });

    // 7. Draw Floating Text Popups
    this.floatingTexts.forEach((ft) => {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = `bold ${ft.fontSize || 14}px "Press Start 2P", monospace`;
      ctx.fillStyle = '#000';
      ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    ctx.restore();
  }
}
