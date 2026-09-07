import { GameBase, VIEW_W, VIEW_H } from './GameBase.js';

// Pixel Breaker — paddle follow, spin control, power-ups, armored+explosive
// bricks, ball trail, hit-stop juice, escalating levels.

const BRICK_COLS = 8;
const BRICK_W = 44;
const BRICK_H = 16;
const BRICK_X0 = 6;
const BRICK_Y0 = 54;

const LAYOUTS = [
  'full',      // full grid
  'checker',
  'pyramid',
  'split',
  'rings',
];

export class BreakerGame extends GameBase {
  constructor(...args) {
    super(...args);
    this.key = 'breaker';
  }

  setup() {
    this.paddle = { x: (VIEW_W - 90) / 2, y: VIEW_H - 42, w: 90, h: 14 };
    this.level = 1;
    this.balls = [];
    this.bricks = [];
    this.powerups = [];
    this.trail = [];
    this.pointerX = VIEW_W / 2;
    this.serve = true;
    this.loadLevel();
  }

  loadLevel() {
    this.bricks = [];
    const lvl = this.level;
    const layout = LAYOUTS[(lvl - 1) % LAYOUTS.length];

    let rows = 5;
    let cols = BRICK_COLS;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let skip = false;
        if (layout === 'checker' && (r + c) % 2 === 0) skip = true;
        if (layout === 'pyramid' && (c < Math.floor(cols / 2) - r || c > Math.floor(cols / 2) + r)) skip = true;
        if (layout === 'split' && (c === Math.floor(cols / 2) - 1 || c === Math.floor(cols / 2))) skip = true;
        if (layout === 'rings' && !(r % 2 === 0)) skip = true;
        if (skip) continue;

        const hp = lvl > 2 && r < 2 ? 2 : 1;
        const explosive = lvl >= 3 && Math.random() < 0.08 && hp === 1;
        this.bricks.push({
          x: BRICK_X0 + c * (BRICK_W + 4),
          y: BRICK_Y0 + r * (BRICK_H + 4),
          w: BRICK_W, h: BRICK_H,
          active: true, hp, explosive,
          color: hp === 2 ? '#94a3b8' : COLORS[r % COLORS.length],
        });
      }
    }
    this.serve = true;
    this.balls = [{ x: VIEW_W / 2, y: VIEW_H - 70, r: 6, dx: 0, dy: -480 }];
    this.paddle.w = Math.max(70, 90 - (lvl - 1) * 5);
    this.paddle.x = (VIEW_W - this.paddle.w) / 2;

    // music tiers: 1-2 calm, 3-4 surge, 5+ final bounce
    this.app.audio.setVariant('breaker', lvl >= 5 ? 2 : lvl >= 3 ? 1 : 0);
  }

  onPointer(x) {
    if (this.serve) {
      this.serve = false;
      for (const b of this.balls) {
        b.dx = (Math.random() < 0.5 ? -1 : 1) * (300 + this.level * 25);
        b.dy = -430;
      }
      this.app.audio.playJump();
    }
  }

  onPointerMove(x) {
    this.pointerX = x;
  }

  update(dt) {
    // paddle follow (smoothed)
    const target = Math.max(0, Math.min(VIEW_W - this.paddle.w, this.pointerX - this.paddle.w / 2));
    this.paddle.x += (target - this.paddle.x) * Math.min(1, dt * 22);

    if (this.serve) {
      this.balls[0].x = this.paddle.x + this.paddle.w / 2;
      this.balls[0].y = VIEW_H - 78;
      return;
    }

    // trail
    this.trail.push({ x: this.balls[0]?.x ?? 0, y: this.balls[0]?.y ?? 0 });
    if (this.trail.length > 9) this.trail.shift();

    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      b.x += b.dx * dt;
      b.y += b.dy * dt;

      if (b.x - b.r < 0) { b.x = b.r; b.dx = Math.abs(b.dx); this.app.audio.playBeep(); }
      if (b.x + b.r > VIEW_W) { b.x = VIEW_W - b.r; b.dx = -Math.abs(b.dx); this.app.audio.playBeep(); }
      if (b.y - b.r < 0) { b.y = b.r; b.dy = Math.abs(b.dy); this.app.audio.playBeep(); }

      // paddle (with magnet edges)
      if (b.dy > 0 && b.y + b.r > this.paddle.y && b.y + b.r < this.paddle.y + 16 &&
          b.x > this.paddle.x - 8 && b.x < this.paddle.x + this.paddle.w + 8) {
        b.y = this.paddle.y - b.r;
        const hit = (b.x - (this.paddle.x + this.paddle.w / 2)) / (this.paddle.w / 2);
        const angle = hit * 68 * (Math.PI / 180);
        const speed = Math.hypot(b.dx, b.dy);
        b.dx = Math.sin(angle) * speed;
        b.dy = -Math.abs(Math.cos(angle) * speed);
        this.app.audio.playBeep();
      }

      if (b.y - b.r > VIEW_H) {
        this.balls.splice(i, 1);
      }
    }

    if (this.balls.length === 0) {
      this.app.audio.playHit();
      this.lives--;
      this.setHud();
      if (this.lives <= 0) {
        this.gameOver(Math.max(3, Math.floor(this.score / 2)));
        return;
      }
      this.serve = true;
      this.balls = [{ x: VIEW_W / 2, y: VIEW_H - 70, r: 6, dx: 0, dy: -480 }];
    }

    // ball vs bricks
    for (const br of this.bricks) {
      if (!br.active) continue;
      for (const b of this.balls) {
        if (b.x + b.r > br.x && b.x - b.r < br.x + br.w &&
            b.y + b.r > br.y && b.y - b.r < br.y + br.h) {
          // bounce off the side with the smallest penetration
          const overlapLeft = b.x + b.r - br.x;
          const overlapRight = br.x + br.w - (b.x - b.r);
          const overlapTop = b.y + b.r - br.y;
          const overlapBottom = br.y + br.h - (b.y - b.r);
          const minO = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          if (minO === overlapLeft || minO === overlapRight) b.dx *= -1;
          else b.dy *= -1;

          br.hp--;
          this.hitStop(2);
          if (br.hp > 0) {
            this.app.audio.playHit();
            br.color = '#cbd5e1';
            continue;
          }
          this.breakBrick(br);
        }
      }
    }

    // level clear
    if (!this.bricks.some((b) => b.active)) {
      this.app.audio.playLevelUp();
      this.level++;
      this.floatText(VIEW_W / 2, VIEW_H / 2 - 40, `LEVEL ${this.level}`, '#fde047', 18);
      this.addShake(6);
      this.loadLevel();
      return;
    }

    // powerups
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.y += 130 * dt;
      if (p.y + 14 > this.paddle.y && p.y < this.paddle.y + this.paddle.h &&
          p.x + 24 > this.paddle.x && p.x < this.paddle.x + this.paddle.w) {
        this.applyPowerup(p);
        this.powerups.splice(i, 1);
      } else if (p.y > VIEW_H) {
        this.powerups.splice(i, 1);
      }
    }
  }

  breakBrick(br) {
    br.active = false;
    this.score += 5 * this.level;
    this.setHud();
    this.app.audio.playEat();
    this.hitStop(4);
    this.addShake(3);
    this.floatText(br.x + br.w / 2, br.y, `+${5 * this.level}`, '#fde047', 9);
    this.burst(br.x + br.w / 2, br.y + br.h / 2, br.color, 10);

    // chained explosion
    if (br.explosive) {
      for (const nb of this.bricks) {
        if (nb.active && nb !== br &&
            Math.abs(nb.x - br.x) < BRICK_W + 10 && Math.abs(nb.y - br.y) < BRICK_H + 10) {
          nb.hp = 1;
          this.breakBrick(nb);
        }
      }
      return;
    }

    // powerup drop
    if (Math.random() < 0.09) {
      const types = [
        { t: 'W', c: '#3b82f6', label: 'WIDE' },
        { t: 'M', c: '#22c55e', label: 'MULTI' },
        { t: 'S', c: '#f59e0b', label: 'SLOW' },
        { t: 'L', c: '#ef4444', label: 'LIFE' },
        { t: 'P', c: '#d946ef', label: 'PIERCE' },
      ];
      const pt = types[Math.floor(Math.random() * types.length)];
      this.powerups.push({ x: br.x + br.w / 2 - 12, y: br.y, vy: 0, type: pt.t, color: pt.c, label: pt.label });
    }
  }

  applyPowerup(p) {
    this.app.audio.playCoin();
    this.floatText(p.x + 12, p.y - 12, p.label, p.color, 8);
    if (p.type === 'W') {
      this.paddle.w = Math.min(160, this.paddle.w + 34);
    } else if (p.type === 'M') {
      const src = this.balls[0];
      if (src) {
        this.balls.push({ x: src.x, y: src.y, r: 6, dx: -src.dx, dy: src.dy - 60 });
        this.balls.push({ x: src.x, y: src.y, r: 6, dx: src.dx * 0.5, dy: src.dy + 60 });
      }
    } else if (p.type === 'S') {
      for (const b of this.balls) { b.dx *= 0.55; b.dy *= 0.55; }
    } else if (p.type === 'L') {
      this.lives = Math.min(5, this.lives + 1);
      this.setHud();
    } else if (p.type === 'P') {
      for (const b of this.balls) {
        b.pierce = (b.pierce || 0) + 3;
      }
    }
  }

  draw(ctx) {
    // bg
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.font = 'bold 58px "Press Start 2P"';
    ctx.textAlign = 'center';
    ctx.fillText(`LVL ${this.level}`, VIEW_W / 2, VIEW_H / 2 + 20);
    ctx.textAlign = 'left';

    // bricks
    for (const br of this.bricks) {
      if (!br.active) continue;
      ctx.fillStyle = br.color;
      ctx.fillRect(br.x, br.y, br.w, br.h);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(br.x, br.y, br.w, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(br.x, br.y + br.h - 4, br.w, 4);
      // corner bevels for the 8-bit brick look
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(br.x, br.y + br.h - 5, 5, 5);
      ctx.fillRect(br.x + br.w - 5, br.y + br.h - 5, 5, 5);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(br.x, br.y, 5, 5);
      if (br.explosive) {
        ctx.fillStyle = '#fff';
        ctx.font = '9px "Press Start 2P"';
        ctx.textAlign = 'center';
        ctx.fillText('💥', br.x + br.w / 2, br.y + br.h / 2 + 3);
        ctx.textAlign = 'left';
      }
    }

    // powerups
    for (const p of this.powerups) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, 24, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(p.x, p.y, 24, 3);
      ctx.fillStyle = '#000';
      ctx.font = '6px "Press Start 2P"';
      ctx.textAlign = 'center';
      ctx.fillText(p.label === 'WIDE' ? 'W' : p.label === 'MULTI' ? 'M' : p.label === 'SLOW' ? 'S' : p.label === 'LIFE' ? 'L' : 'P', p.x + 12, p.y + 8);
      ctx.textAlign = 'left';
    }

    // paddle — center grip + end caps (arcade 2-section look)
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(this.paddle.x, this.paddle.y, this.paddle.w, 4);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(this.paddle.x, this.paddle.y + 3, 7, this.paddle.h - 6);
    ctx.fillRect(this.paddle.x + this.paddle.w - 7, this.paddle.y + 3, 7, this.paddle.h - 6);
    ctx.fillStyle = 'rgba(2,132,199,0.85)';
    ctx.fillRect(this.paddle.x + this.paddle.w / 2 - 11, this.paddle.y + 3, 22, this.paddle.h - 6);

    // trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      ctx.globalAlpha = (i / this.trail.length) * 0.4;
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(t.x, t.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // balls
    for (const b of this.balls) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(b.x - 1.5, b.y - 1.5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#d946ef'];