import { GameBase, VIEW_W, VIEW_H } from './GameBase.js';
import { drawSprite } from './pixel.js';
import { FLAPPY, COIN, PIPE } from './sprites.js';

const GRAVITY = 1350;      // u/s²
const FLAP = -410;         // u/s (jump impulse)
const PIPE_SPEED = 175;    // u/s
const GAP = 180;
const PIPE_W = 54;
const PLAYER_X = 82;
const PLAYER_SIZE = 20;

export class FlappyGame extends GameBase {
  constructor(...args) {
    super(...args);
    this.key = 'flappy';
  }

  setup() {
    this.y = VIEW_H / 2;
    this.vy = 0;
    this.pipes = [];
    this.bgOffset = 0;
    this.invuln = 0;
    this.pipeTimer = 60;
    this.blink = 0;
    this._musicTier = 0;
  }

  onJumpPress() {
    if (!this.running) return;
    this.vy = FLAP;
    this.app.audio.playJump();
  }

  onPointer() {
    this.onJumpPress();
  }

  update(dt) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.blink > 0) this.blink -= dt;

    // physics
    this.vy = Math.min(this.vy + GRAVITY * dt, 620);
    this.y += this.vy * dt;

    // background scroll
    this.bgOffset = (this.bgOffset - 60 * dt) % 400;

    // pipes
    this.pipeTimer -= dt;
    if (this.pipeTimer <= 0) {
      this.pipeTimer = 1.45;
      const gapY = 80 + Math.random() * (VIEW_H - 380);
      this.pipes.push({ x: VIEW_W, gapY, passed: false });
    }

    for (let i = this.pipes.length - 1; i >= 0; i--) {
      const p = this.pipes[i];
      p.x -= PIPE_SPEED * dt;

      const hitH = PLAYER_SIZE * 0.7;
      const body = {
        x: PLAYER_X + 2, y: this.y + 4, w: PLAYER_SIZE - 4, h: hitH,
      };
      const topHit = { x: p.x, y: -50, w: PIPE_W, h: p.gapY + 50 };
      const botHit = { x: p.x, y: p.gapY + GAP, w: PIPE_W, h: VIEW_H - (p.gapY + GAP) };

      if (this.invuln <= 0 && (this.aabb(body, topHit) || this.aabb(body, botHit))) {
        this.app.audio.playHit();
        this.lives--;
        this.invuln = 1.2;
        this.blink = 1.2;
        this.addShake(8);
        this.setHud();
        if (this.lives <= 0) {
          this.floatText(PLAYER_X, this.y, 'CRASH', '#ef4444');
          this.gameOver(Math.max(5, this.score * 2));
          return;
        }
      }

      if (p.x + PIPE_W < PLAYER_X && !p.passed) {
        p.passed = true;
        this.score++;
        // milestone tiers: low / mid / danger
        const tier = this.score >= 60 ? 2 : this.score >= 25 ? 1 : 0;
        if (tier !== this._musicTier) {
          this._musicTier = tier;
          this.app.audio.setVariant('flappy', tier);
        }
        this.app.audio.playCoin();
        this.floatText(PLAYER_X + 8, this.y - 26, '+1');
        this.setHud();
      }

      if (p.x < -80) this.pipes.splice(i, 1);
    }

    // floor/ceiling
    if (this.y > VIEW_H - 22 || this.y < -30) {
      this.app.audio.playHit();
      this.gameOver(Math.max(5, this.score * 2));
    }
  }

  draw(ctx) {
    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#0b1026');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // stars
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 26; i++) {
      const sx = (i * 97) % VIEW_W;
      const sy = (i * 53) % 260;
      ctx.globalAlpha = 0.3 + ((i * 7) % 5) * 0.14;
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;

    // moon
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(330, 76, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0b1026';
    ctx.beginPath();
    ctx.arc(318, 68, 22, 0, Math.PI * 2);
    ctx.fill();

    // parallax city layers
    for (const layer of [0.5, 1.0]) {
      ctx.fillStyle = layer === 0.5 ? '#111a35' : '#0d1526';
      for (let i = 0; i < 4; i++) {
        const bx = ((i * 120 + this.bgOffset * (layer / 2)) % (VIEW_W + 120)) - 60;
        ctx.fillRect(bx, 480 - layer * 60, 46 + i * 22, layer * 140 + 130);
        ctx.fillRect(bx + 90, 420 + layer * 20, 34 + i * 10, 220);
      }
    }
    const floorY = VIEW_H - 18;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, floorY, VIEW_W, 18);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, floorY, VIEW_W, 3);

    // pipes
    for (const p of this.pipes) {
      drawPipe(ctx, p.x, 0, PIPE_W, p.gapY);
      drawPipe(ctx, p.x, p.gapY + GAP, PIPE_W, VIEW_H - (p.gapY + GAP));
    }

    // player (blinks during i-frames)
    if (this.invuln <= 0 || Math.floor(this.time * 12) % 2 === 0) {
      ctx.save();
      ctx.translate(PLAYER_X + PLAYER_SIZE / 2, this.y + PLAYER_SIZE / 2);
      ctx.rotate(Math.max(-0.65, Math.min(0.65, this.vy * 0.0011)));
      const flap = FLAPPY[Math.floor(this.time * 9) % 2];
      drawSprite(ctx, flap.r, flap.p, -PLAYER_SIZE / 2, -PLAYER_SIZE / 2, { scale: 1 });
      ctx.restore();
    }
  }
}

function drawPipe(ctx, x, y, w, h) {
  // body: tile the shared PIPE sprite
  const ts = 1.875;
  const tw = Math.round(16 * ts);
  for (let yy = y; yy < y + h; yy += tw) {
    for (let xx = x; xx < x + w; xx += tw) {
      drawSprite(ctx, PIPE.r, PIPE.p, xx, yy, { scale: ts });
    }
  }
  // cap
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(x - 5, y, w + 10, 16);
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(x - 5, y, 12, 16);
  ctx.fillStyle = '#14532d';
  ctx.fillRect(x + w - 7, y, 12, 16);
}