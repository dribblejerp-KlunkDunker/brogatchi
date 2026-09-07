// Shared game engine: fixed-timestep loop (frame-rate independent physics),
// unified HUD, keyboard/touch input, and a small "juice" library
// (screen shake, hit-stop, floating text, particles).

export const VIEW_W = 400;
export const VIEW_H = 600;

export class GameBase {
  constructor(app, cvs) {
    this.app = app;
    this.cvs = cvs;
    this.ctx = cvs.getContext('2d');
    this.key = 'game';
    this.running = false;
    this.raf = null;
    this.accum = 0;
    this.last = 0;
    this.time = 0;
    this.score = 0;
    this.lives = 3;
    this.keys = { left: false, right: false, up: false };
    this.shake = 0;
    this.hitstop = 0;
    this.floats = [];
    this.particles = [];
  }

  // ---------- lifecycle ----------
  start() {
    this.setup();
    this.running = true;
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.bindKeys();
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    this.unbindKeys();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  loop(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.accum += dt;
    const step = 1 / 60;
    let guard = 0;
    while (this.accum >= step && guard++ < 5) {
      if (this.hitstop > 0) {
        this.hitstop--;
      } else {
        this.update(step);
        this.time += step;
      }
      this.accum -= step;
    }
    this.render();
    if (this.running) this.raf = requestAnimationFrame(this.loop);
  }

  render() {
    const { ctx } = this;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.shake *= 0.88;
      if (this.shake < 0.4) this.shake = 0;
    }
    this.draw(ctx);
    this.drawParticles(ctx);
    this.drawFloats(ctx);
    ctx.restore();
  }

  // ---------- HUD ----------
  setHud() {
    const scoreEl = document.getElementById('game-score');
    const livesEl = document.getElementById('game-lives');
    if (scoreEl) scoreEl.innerText = `SCORE: ${this.score}`;
    if (livesEl) livesEl.innerText = '❤️'.repeat(Math.max(0, this.lives));
  }

  // ---------- input ----------
  bindKeys() {
    this._kd = (e) => this.mapKey(e, true);
    this._ku = (e) => this.mapKey(e, false);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    // Pad buttons are re-created on every launch in the 3.0 window shell,
    // so bind per-instance (with cleanup) instead of once per page load.
    this._padCleanup = [];
    const bindBtn = (id, k) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      const down = (e) => { e.preventDefault(); this.keys[k] = true; };
      const up = () => { this.keys[k] = false; };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      this._padCleanup.push(() => {
        btn.removeEventListener('pointerdown', down);
        btn.removeEventListener('pointerup', up);
        btn.removeEventListener('pointerleave', up);
      });
    };
    bindBtn('btn-left', 'left');
    bindBtn('btn-right', 'right');
    bindBtn('btn-jump', 'up');
  }

  unbindKeys() {
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    (this._padCleanup || []).forEach((fn) => fn());
    this._padCleanup = [];
  }

  mapKey(e, down) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') this.keys.left = down;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') this.keys.right = down;
    else if (k === 'ArrowUp' || k === 'z' || k === 'Z' || k === ' ' || k === 'w' || k === 'W') {
      this.keys.up = down;
      if (down && this.onJumpPress) this.onJumpPress();
    }
    if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
  }

  // subclasses override
  setup() {}
  update(dt) {}
  draw(ctx) {}
  onPointer(x, y) {}
  onPointerMove(x, y) {}
  onJumpPress() {}

  // ---------- juice ----------
  addShake(m) { this.shake = Math.min(22, this.shake + m); }
  hitStop(frames) { this.hitstop = Math.max(this.hitstop, frames); }
  floatText(x, y, text, color = '#fff', size = 13) {
    this.floats.push({ x, y, text, color, size, life: 1 });
  }
  burst(x, y, color, n = 8, speed = 140) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1,
        size: 2 + Math.random() * 3, color,
      });
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      p.x += p.vx * 0.016;
      p.y += p.vy * 0.016;
      p.vy += 420 * 0.016;
      p.life -= 0.022;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    ctx.globalAlpha = 1;
  }

  drawFloats(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floats) {
      f.y -= 34 * 0.016;
      f.life -= 0.016;
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.font = `bold ${f.size}px "Press Start 2P"`;
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 2, f.y + 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    this.floats = this.floats.filter((f) => f.life > 0);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ---------- helpers ----------
  aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Ends the run, pays out through the app.
  gameOver(reward = 0) {
    this.stop();
    this.app.onGameOver(this.key, this.score, reward);
  }
}