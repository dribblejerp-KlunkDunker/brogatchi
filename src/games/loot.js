import { GameBase, VIEW_W, VIEW_H } from './GameBase.js';
import { drawSprite } from './pixel.js';
import { RYAN_RUN1, RYAN_RUN2, COIN } from './sprites.js';

// LOOT SHOWER — coins are "leaking" out of the billionaire grid and Ryan is
// the only one who can catch them before the devs patch the leak. Move with
// left/right keys, the virtual pad, or drag the pointer. Coins score points
// and build a combo multiplier; "dev patch" bombs cost a life. Fall speed and
// spawn rate ramp over time, and the score tiers switch the music variant.

const ACCEL = 2600;
const MAX_VX = 340;
const FRICTION = 7;
const PLAYER_W = 32;
const PLAYER_H = 40;
const PLAYER_Y = VIEW_H - 62;   // top-left of the catch zone
const FLOOR_Y = VIEW_H - 14;

export class LootGame extends GameBase {
  constructor(...args) {
    super(...args);
    this.key = 'loot';
  }

  setup() {
    this.px = VIEW_W / 2 - PLAYER_W / 2;
    this.vx = 0;
    this.dir = 1;
    this.pointerX = null;
    this.items = [];
    this.spawnTimer = 1.0;
    this.combo = 0;
    this.bestCombo = 0;
    this.invuln = 0;
    this._musicTier = 0;
    this._bgBytes = [];
    for (let i = 0; i < 18; i++) {
      this._bgBytes.push({
        x: Math.random() * VIEW_W,
        y: Math.random() * VIEW_H,
        vy: 20 + Math.random() * 60,
        s: Math.random() < 0.5 ? 1 : 2,
      });
    }
  }

  // ---- input: keys AND pointer follow ----
  onPointer(x) {
    this.pointerX = x;
  }

  onPointerMove(x) {
    this.pointerX = x;
  }

  update(dt) {
    if (this.invuln > 0) this.invuln -= dt;

    // ---- difficulty ramp over time ----
    const t = this.time;
    const spawnInterval = Math.max(0.45, 1.15 - t * 0.012);
    const baseSpeed = 160 + Math.min(260, t * 4.5);
    const bombChance = Math.min(0.42, 0.25 + t * 0.0035);

    // ---- movement: keys, else glide toward pointer ----
    const accel = this.keys.left ? -ACCEL : this.keys.right ? ACCEL : 0;
    if (accel !== 0) {
      this.vx += accel * dt;
    } else if (this.pointerX != null) {
      const target = this.pointerX - PLAYER_W / 2;
      const diff = target - this.px;
      this.vx = Math.max(-MAX_VX, Math.min(MAX_VX, diff * 8));
      if (Math.abs(diff) < 2) { this.px = target; this.vx = 0; }
    } else {
      this.vx *= Math.exp(-FRICTION * dt);
    }
    this.vx = Math.max(-MAX_VX, Math.min(MAX_VX, this.vx));
    if (Math.abs(this.vx) < 6 && accel === 0 && this.pointerX == null) this.vx = 0;
    this.px += this.vx * dt;
    if (this.vx > 8) this.dir = 1;
    if (this.vx < -8) this.dir = -1;
    this.px = Math.max(0, Math.min(VIEW_W - PLAYER_W, this.px));

    // ---- background bytes drift ----
    for (const b of this._bgBytes) {
      b.y += b.vy * dt;
      if (b.y > VIEW_H) { b.y = -6; b.x = Math.random() * VIEW_W; }
    }

    // ---- spawn ----
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.items.length < 14) {
      this.spawnTimer = spawnInterval * (0.7 + Math.random() * 0.6);
      const bomb = Math.random() < bombChance;
      this.items.push({
        x: 22 + Math.random() * (VIEW_W - 44),
        y: -34,
        vy: baseSpeed * (bomb ? 1.15 : 1) * (0.9 + Math.random() * 0.3),
        bomb,
        w: bomb ? 28 : 24,
        h: bomb ? 28 : 22,
      });
    }

    // ---- items ----
    const player = { x: this.px, y: PLAYER_Y, w: PLAYER_W, h: PLAYER_H };
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.y += it.vy * dt;

      // caught?
      if (this.aabb(player, it)) {
        if (it.bomb) {
          this.combo = 0;
          this.lives--;
          this.invuln = 1.2;
          this.addShake(11);
          this.hitStop(4);
          this.app.audio.playHit();
          this.setHud();
          this.floatText(it.x, it.y - 8, 'DEV PATCH!', '#f87171', 12);
          this.burst(it.x + it.w / 2, it.y + it.h / 2, '#ef4444', 14, 170);
          this.burst(it.x + it.w / 2, it.y + it.h / 2, '#fbbf24', 6, 90);
          if (this.lives <= 0) {
            this.gameOver(Math.max(5, this.score * 2));
            return;
          }
        } else {
          this.combo++;
          this.bestCombo = Math.max(this.bestCombo, this.combo);
          const mult = Math.min(5, 1 + Math.floor(this.combo / 4));
          this.score += mult;
          this.app.audio.playCoin();
          const tier = this.score >= 60 ? 2 : this.score >= 25 ? 1 : 0;
          if (tier !== this._musicTier) {
            this._musicTier = tier;
            this.app.audio.setVariant('loot', tier);
          }
          this.floatText(it.x + it.w / 2, it.y - 6, `+${mult}`, '#fde047', 11);
          this.burst(it.x + it.w / 2, it.y + it.h / 2, '#fde047', 9, 120);
          this.setHud();
        }
        this.items.splice(i, 1);
        continue;
      }

      // fell past the floor: missed coin breaks the combo
      if (it.y > FLOOR_Y + 6) {
        if (!it.bomb && this.combo > 0) {
          this.combo = 0;
          this.floatText(it.x, FLOOR_Y - 8, 'miss', '#64748b', 8);
        } else if (it.bomb) {
          // patches fizzle out harmlessly on the floor
          this.burst(it.x + it.w / 2, FLOOR_Y, '#94a3b8', 4, 60);
        }
        this.items.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    // ---- vault backdrop ----
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#0b1026');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // glow where the leak is
    const glow = ctx.createRadialGradient(VIEW_W / 2, -20, 10, VIEW_W / 2, -20, 260);
    glow.addColorStop(0, 'rgba(250,204,21,0.28)');
    glow.addColorStop(1, 'rgba(250,204,21,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, VIEW_W, 260);

    // ambient falling bytes
    ctx.fillStyle = '#1e293b';
    for (const b of this._bgBytes) {
      ctx.fillRect(b.x, b.y, b.s, b.s);
    }

    // scanlines
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let y = 0; y < VIEW_H; y += 4) ctx.fillRect(0, y, VIEW_W, 1);

    // floor
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, FLOOR_Y, VIEW_W, 2);
    ctx.fillStyle = 'rgba(250,204,21,0.08)';
    ctx.fillRect(0, FLOOR_Y + 2, VIEW_W, 8);

    // ---- items ----
    for (const it of this.items) {
      if (it.bomb) {
        drawBomb(ctx, it.x, it.y, this.time);
      } else {
        const frame = COIN[Math.floor(this.time * 12) % 2];
        drawSprite(ctx, frame.r, frame.p, it.x, it.y, { scale: 2 });
      }
    }

    // ---- combo meter ----
    if (this.combo >= 3) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px "Press Start 2P"';
      ctx.fillStyle = '#000';
      ctx.fillText(`COMBO x${Math.min(5, 1 + Math.floor(this.combo / 4))}`, VIEW_W / 2 + 2, 42);
      ctx.fillStyle = '#fde047';
      ctx.fillText(`COMBO x${Math.min(5, 1 + Math.floor(this.combo / 4))}`, VIEW_W / 2, 40);
      ctx.textAlign = 'left';
    }

    // ---- player ----
    if (this.invuln <= 0 || Math.floor(this.time * 14) % 2 === 0) {
      const moving = Math.abs(this.vx) > 24;
      const frame = moving ? (Math.floor(this.time * 12) % 2 === 0 ? RYAN_RUN1 : RYAN_RUN2) : RYAN_RUN1;
      drawSprite(ctx, frame.r, frame.p, this.px, PLAYER_Y, { scale: 2, flip: this.dir < 0, shadow: true });
    }

    // catch-zone hint line
    ctx.fillStyle = 'rgba(148,163,184,0.18)';
    ctx.fillRect(0, PLAYER_Y + PLAYER_H - 2, VIEW_W, 2);
  }
}

function drawBomb(ctx, x, y, time) {
  const w = 28, h = 28;
  // body
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  // inner panel
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  // blinking core
  const blink = Math.floor(time * 8) % 2 === 0;
  ctx.fillStyle = blink ? '#ef4444' : '#7f1d1d';
  ctx.fillRect(x + 10, y + 10, 8, 8);
  // fuse spark
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(x + w / 2 - 1, y - 4, 2, 4);
  const sp = Math.floor(time * 16) % 2 === 0;
  ctx.fillStyle = sp ? '#fde047' : '#b45309';
  ctx.fillRect(x + w / 2 - 2, y - 7, 4, 3);
}