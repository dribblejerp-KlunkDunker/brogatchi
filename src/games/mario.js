import { GameBase, VIEW_W, VIEW_H } from './GameBase.js';
import { drawSprite } from './pixel.js';
import { RYAN_RUN1, RYAN_RUN2, REPTOID, COIN, QBLOCK, QBLOCK_EMPTY, BRICK, PIPE } from './sprites.js';

// Super Bro Land — Ryan's run to the 5G tower.
// Fixed-timestep physics, coyote time, jump buffering, variable jump height,
// checkpoint respawn, parallax clouds, pixel sprites.

const ACCEL = 1500;
const MAX_VX = 265;
const FRICTION = 5.5;
const GRAVITY = 1450;
const MAX_VY = 800;
const JUMP_V = -545;
const JUMP_CUT = 0.45;
const COYOTE = 0.1;
const BUFFER = 0.14;
const STOMP_BOUNCE = -430;
const ENEMY_GROUND = 526; // enemies walk on the floor (was referenced but never defined)

export class MarioGame extends GameBase {
  constructor(...args) {
    super(...args);
    this.key = 'mario';
  }

  setup() {
    this.player = {
      x: 50, y: 460, w: 24, h: 32,
      vx: 0, vy: 0, dir: 1,
      groundCoyote: 0, jumpBuffer: 0,
      deaths: 0,
    };
    this.camX = 0;
    this.invuln = 0;
    this.checkpointReached = false;
    this.respawn = { x: 50, y: 460 };
    this.winFrames = -1;
    this.jumpQueued = false;
    this.jumpWasPressed = false;
    this.enemies = [
      { x: 500, y: 526, w: 24, h: 24, vx: -60, alive: true, frame: 0 },
      { x: 1000, y: 526, w: 24, h: 24, vx: 64, alive: true, frame: 0 },
      { x: 1400, y: 526, w: 24, h: 24, vx: -80, alive: true, frame: 0 },
      { x: 1900, y: 526, w: 24, h: 24, vx: -60, alive: true, frame: 0 },
    ];
  }

  tiles() {
    return [
      // ground
      { x: -200, y: 552, w: 1100, h: 200, solid: true, ground: true },
      { x: 900, y: 552, w: 700, h: 200, solid: true, ground: true },
      { x: 1650, y: 552, w: 1200, h: 200, solid: true, ground: true },
      // pipes
      { x: 400, y: 482, w: 56, h: 70, pipe: true },
      { x: 600, y: 442, w: 56, h: 110, pipe: true },
      { x: 1200, y: 452, w: 36, h: 40, tower: true },
      { x: 1236, y: 412, w: 36, h: 80, tower: true },
      { x: 1272, y: 372, w: 36, h: 120, tower: true },
      // question / bricks
      { x: 250, y: 400, w: 30, h: 30, q: true, used: false },
      { x: 350, y: 300, w: 30, h: 30, q: true, used: false },
      { x: 1820, y: 352, w: 30, h: 30, q: true, used: false },
      { x: 1850, y: 352, w: 30, h: 30, q: true, used: false },
      { x: 750, y: 400, w: 30, h: 30, brick: true },
      { x: 814, y: 400, w: 30, h: 30, brick: true },
      // 5G goal tower
      { x: 2720, y: 120, w: 12, h: 432, goal: true },
    ];
  }

  update(dt) {
    const p = this.player;

    if (this.winFrames > -1) {
      // victory slide / fireworks
      this.winFrames -= dt;
      p.y += 40 * dt;
      if (Math.random() < 0.3) this.burst((this.camX + Math.random() * VIEW_W) | 0, 60 + Math.random() * 200, Math.random() < 0.5 ? '#fde047' : '#f472b6', 4, 90);
      if (this.winFrames <= 0) {
        this.gameOver(this.score + 50);
      }
      return;
    }

    if (this.invuln > 0) this.invuln -= dt;
    if (p.jumpBuffer > 0) p.jumpBuffer -= dt;
    if (p.groundCoyote > 0 && !p.grounded) p.groundCoyote -= dt;

    // ---- input & physics ----
    const accel = this.keys.left ? -ACCEL : this.keys.right ? ACCEL : 0;
    p.vx += accel * dt;
    if (accel === 0) p.vx *= Math.exp(-FRICTION * dt);
    p.vx = Math.max(-MAX_VX, Math.min(MAX_VX, p.vx));
    if (Math.abs(p.vx) < 6 && accel === 0) p.vx = 0;
    if (accel !== 0) p.dir = accel > 0 ? 1 : -1;

    if (this.keys.up || this.jumpQueued) {
      this.jumpQueued = false;
      this.jumpWasPressed = true;
      if (p.groundCoyote > 0) {
        p.vy = JUMP_V;
        p.grounded = false;
        p.groundCoyote = 0;
        this.app.audio.playJump();
        this.burst(p.x + p.w / 2, p.y + p.h, '#e2e8f0', 4, 60);
      }
    }

    // variable jump: releasing jump mid-rise cuts the jump short
    if (!this.keys.up && p.vy < -160) p.vy = Math.max(p.vy, -160);

    p.vy = Math.min(p.vy + GRAVITY * dt, MAX_VY);

    // ---- X collision ----
    p.x += p.vx * dt;
    for (const t of this.tiles()) {
      if (!t.solid) continue;
      if (this.aabb(p, t)) {
        if (p.vx > 0) p.x = t.x - p.w;
        else if (p.vx < 0) p.x = t.x + t.w;
        p.vx = 0;
      }
    }

    // ---- Y collision ----
    const wasFalling = p.vy > 0;
    p.y += p.vy * dt;
    p.grounded = false;
    for (const t of this.tiles()) {
      if (!t.solid && !t.q && !t.brick) continue;
      if (this.aabb(p, t)) {
        if (p.vy > 0) {
          p.y = t.y - p.h;
          p.vy = 0;
          p.grounded = true;
          p.groundCoyote = COYOTE;
          if (wasFalling) this.burst(p.x + p.w / 2, p.y + p.h, '#e2e8f0', 3, 40);
        } else if (p.vy < 0) {
          p.y = t.y + t.h;
          p.vy = 0;
          this.hitBlock(t);
        }
      }
    }

    // ---- death by pit ----
    if (p.y > VIEW_H + 60) {
      this.playerDie(false);
      return;
    }

    // ---- goal ----
    const goal = this.tiles().find((t) => t.goal);
    if (goal && this.aabb(p, goal) && this.winFrames < 0) {
      this.winFrames = 1.4;
      this.app.audio.playLevelUp();
      this.app.audio.setVariant('mario', 2);
      p.vy = 0;
      p.x = goal.x - p.w;
      this.floatText(VIEW_W / 2, 150, '5G SECURED', '#fde047', 16);
      return;
    }

    // ---- checkpoint ----
    if (!this.checkpointReached && p.x > 1500) {
      this.checkpointReached = true;
      this.respawn = { x: 1480, y: 400 };
      this.floatText(VIEW_W / 2, 200, 'CHECKPOINT SAVED', '#4ade80', 12);
      this.app.audio.playCoin();
      this.app.audio.setVariant('mario', 1);
    }

    // ---- entities ----
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.frame++;
      e.x += e.vx * dt;
      e.y = ENEMY_GROUND;
      // walls (pipes / towers / blocks)
      for (const t of this.tiles()) {
        if (t.solid || t.goal) continue;
        if (e.x + e.w > t.x && e.x < t.x + t.w && e.y + e.h > t.y && e.y < t.y + t.h) {
          e.x -= e.vx * dt;
          e.vx *= -1;
          break;
        }
      }
      // gap check
      const under = this.tiles().some((t) => (t.solid || t.ground) && e.x + 8 > t.x && e.x + e.w - 8 < t.x + t.w && Math.abs(e.y + 24 - t.y) < 10);
      if (!under) {
        e.alive = false;
        continue;
      }
      // stomp / damage
      if (this.invuln <= 0 && p.y + p.h - e.y > -6 && p.y < e.y + 24) {
        if (p.vy > 0 && p.y + p.h < e.y + 14) {
          e.alive = false;
          p.vy = STOMP_BOUNCE;
          this.score += 10;
          this.setHud();
          this.app.audio.playEat();
          this.addShake(4);
          this.floatText(e.x + e.w / 2, e.y - 8, '+10', '#fde047', 10);
          this.burst(e.x + e.w / 2, e.y + 12, '#94a3b8', 8);
        } else {
          this.playerDamage(e);
          if (!this.running) return;
        }
      }
    }

    // ---- camera ----
    const target = p.x - VIEW_W * 0.36;
    this.camX += (Math.max(0, target) - this.camX) * Math.min(1, dt * 8);
    this.camX = Math.max(0, Math.min(this.camX, 2720 - VIEW_W + 200));
  }

  hitBlock(t) {
    if (t.q && !t.used) {
      t.used = true;
      this.score += 5;
      this.setHud();
      this.app.audio.playCoin();
      this.burst(t.x + t.w / 2, t.y - 4, '#fde047', 10);
      this.floatText(t.x + t.w / 2, t.y - 18, '+5', '#fde047', 9);
    } else if (t.brick) {
      t.brick = false;
      this.score += 10;
      this.setHud();
      this.app.audio.playEat();
      this.burst(t.x + t.w / 2, t.y - 2, '#b91c1c', 12, 160);
      this.floatText(t.x + t.w / 2, t.y - 18, '+10', '#f87171', 9);
    }
  }

  playerDamage() {
    this.app.audio.playHit();
    this.lives--;
    this.invuln = 1.6;
    this.addShake(6);
    this.setHud();
    if (this.lives <= 0) {
      this.gameOver(this.score + 50);
    }
  }

  playerDie() {
    this.app.audio.playHit();
    this.player.deaths++;
    this.lives--;
    this.setHud();
    if (this.lives <= 0) {
      this.gameOver(this.score + 50);
      return;
    }
    const p = this.player;
    p.x = this.respawn.x;
    p.y = this.respawn.y;
    p.vx = 0;
    p.vy = 0;
    this.camX = Math.max(0, p.x - VIEW_W * 0.36);
    this.floatText(VIEW_W / 2, 180, 'RESPAWNING…', '#94a3b8', 10);
  }

  draw(ctx) {
    const p = this.player;
    const cam = this.camX;

    // sky
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.6, '#bae6fd');
    grad.addColorStop(1, '#7dd3fc');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // sun + clouds (parallax)
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(320, 70, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(-cam * 0.25, 0);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 8; i++) {
      const cx = 80 + i * 300;
      const cy = 70 + (i % 2) * 70;
      cloud(ctx, cx, cy);
    }
    ctx.restore();

    ctx.save();
    ctx.translate(-cam, 0);

    // tiles
    for (const t of this.tiles()) {
      if (t.ground) {
        ctx.fillStyle = '#854d0e';
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(t.x, t.y, t.w, 14);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(t.x, t.y, t.w, 3);
        ctx.fillStyle = '#713f12';
        for (let px = 0; px < t.w; px += 26) ctx.fillRect(t.x + px + 4, t.y + 26 + (px % 3) * 12, 5, 5);
      } else if (t.pipe) {
        // body: tile the shared PIPE sprite
        const ts = 1.875;
        const tw = Math.round(16 * ts);
        for (let yy = t.y; yy < t.y + t.h; yy += tw) {
          for (let xx = t.x; xx < t.x + t.w; xx += tw) {
            drawSprite(ctx, PIPE.r, PIPE.p, xx, yy, { scale: ts });
          }
        }
        // lip
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(t.x - 4, t.y - 6, t.w + 8, 14);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(t.x - 4, t.y - 6, 12, 14);
        ctx.fillStyle = '#14532d';
        ctx.fillRect(t.x + t.w - 8, t.y - 6, 12, 14);
      } else if (t.tower) {
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(t.x + 3, t.y, 8, t.h - 2);
        ctx.fillStyle = '#450a0a';
        ctx.fillRect(t.x + t.w - 8, t.y, 8, t.h - 2);
      } else if (t.q) {
        // pulse
        const toggle = Math.floor(this.time * 2) % 2 === 0;
        if (t.used) {
          drawSprite(ctx, QBLOCK_EMPTY.r, QBLOCK_EMPTY.p, t.x, t.y, { scale: 1.875 });
        } else {
          drawSprite(ctx, QBLOCK.r, QBLOCK.p, t.x, t.y, { scale: 1.875 });
          if (toggle) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(t.x, t.y, t.w, 3); }
        }
      } else if (t.brick) {
        drawSprite(ctx, BRICK.r, BRICK.p, t.x, t.y, { scale: 1.875 });
      } else if (t.goal) {
        // 5G tower
        ctx.fillStyle = '#475569';
        ctx.fillRect(t.x, t.y, t.w, t.h);
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        for (let yy = t.y; yy < t.y + t.h; yy += 22) {
          ctx.beginPath();
          ctx.moveTo(t.x - 7, yy);
          ctx.lineTo(t.x + t.w + 7, yy + 10);
          ctx.stroke();
        }
        const pulse = Math.abs(Math.sin(this.time * 3)) * 8;
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(t.x + 6, t.y - 14, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(239,68,68,0.4)';
        ctx.beginPath();
        ctx.arc(t.x + 6, t.y - 14, 13 + pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // enemies
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const frame = REPTOID[Math.floor(e.frame / 8) % 2];
      drawSprite(ctx, frame.r, frame.p, e.x, e.y, { scale: 1.6, flip: e.vx < 0, shadow: true });
    }

    // player
    if (this.invuln <= 0 || Math.floor(this.time * 14) % 2 === 0) {
      const moving = Math.abs(p.vx) > 40 && p.grounded;
      const frame = moving ? (Math.floor(this.time * 12) % 2 === 0 ? RYAN_RUN1 : RYAN_RUN2) : RYAN_RUN1;
      drawSprite(ctx, frame.r, frame.p, p.x, p.y, { scale: 2.4, flip: p.dir < 0, shadow: true });
    }

    ctx.restore();
  }

  onPointer() {
    this.jumpQueued = true;
  }

  onJumpPress() {
    this.jumpQueued = true;
  }
}

function cloud(ctx, x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.arc(x + 16, y - 10, 20, 0, Math.PI * 2);
  ctx.arc(x + 34, y, 16, 0, Math.PI * 2);
  ctx.fill();
}