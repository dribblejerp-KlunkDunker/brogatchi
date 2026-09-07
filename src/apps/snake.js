// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/apps/snake.js — SNAKE.EXE
// Real, playable arcade module (fixed-timestep, keyboard + touch).
// Rewards CR + XP on game over; best score persisted by the store.
// ═══════════════════════════════════════════════════════════

const COLS = 20, ROWS = 15, CELL = 16;

export function startSnake(container, { onGameOver, audio, music = null }) {
  container.innerHTML = `
    <div class="flex flex-col items-center gap-2 h-full">
      <div class="w-full flex justify-between font-mono text-[10px]">
        <span class="text-neon-green text-glow-green">SNAKE.EXE // RUNNING</span>
        <span class="text-text-muted">SCORE <span id="snake-score" class="text-neon-cyan">0</span> · BEST <span id="snake-best" class="text-neon-amber">0</span></span>
      </div>
      <canvas id="snake-canvas" width="${COLS * CELL}" height="${ROWS * CELL}"
        class="border border-neon-green/40 bg-void max-w-full" style="image-rendering:pixelated"></canvas>
      <div class="grid grid-cols-3 gap-1 sm:hidden" aria-label="Snake touch controls">
        <span></span>
        <button data-dir="up" class="btn-cyber text-[9px]">▲</button>
        <span></span>
        <button data-dir="left" class="btn-cyber text-[9px]">◀</button>
        <button data-dir="down" class="btn-cyber text-[9px]">▼</button>
        <button data-dir="right" class="btn-cyber text-[9px]">▶</button>
      </div>
      <p class="font-mono text-[9px] text-text-muted hidden sm:block">ARROWS / WASD TO STEER · ESC EXITS</p>
    </div>`;

  const canvas = container.querySelector('#snake-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = container.querySelector('#snake-score');

  let snake, dir, nextDir, food, score, alive, stepMs, acc, last, raf;

  function resetRun() {
    snake = [{ x: 9, y: 7 }, { x: 8, y: 7 }, { x: 7, y: 7 }];
    dir = { x: 1, y: 0 };
    nextDir = dir;
    score = 0;
    alive = true;
    stepMs = 140;
    acc = 0;
    placeFood();
    scoreEl.textContent = '0';
  }

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
    } while (snake.some((s) => s.x === food.x && s.y === food.y));
  }

  function css(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function draw() {
    const voidC = css('--color-void', '#04050A');
    const green = css('--color-neon-green', '#00FF9D');
    const amber = css('--color-neon-amber', '#FFD000');
    const grid = css('--color-border', '#1A1D33');
    ctx.fillStyle = voidC;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = grid;
    ctx.globalAlpha = 0.35;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, ROWS * CELL); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(COLS * CELL, y * CELL); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // food
    ctx.fillStyle = amber;
    ctx.shadowColor = amber; ctx.shadowBlur = 8;
    ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.shadowBlur = 0;
    // snake
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? '#FFFFFF' : green;
      ctx.shadowColor = green; ctx.shadowBlur = i === 0 ? 10 : 4;
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.shadowBlur = 0;
    if (!alive) {
      ctx.fillStyle = 'rgba(4,5,10,0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FF003C';
      ctx.font = 'bold 20px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('SIGNAL LOST', canvas.width / 2, canvas.height / 2 - 8);
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '11px "Share Tech Mono", monospace';
      ctx.fillText(`+${Math.floor(score / 2)} CR · +${score} XP — reopening…`, canvas.width / 2, canvas.height / 2 + 14);
    }
  }

  function step() {
    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const hitWall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
    const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) {
      alive = false;
      audio?.error();
      const coins = Math.floor(score / 2);
      draw();
      setTimeout(() => onGameOver(score, coins), 1400);
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      scoreEl.textContent = score;
      audio?.coin();
      if (stepMs > 70) {
        stepMs -= 3;
        // Speed tier: like the 2.0 games' setVariant milestones, the loop
        // switches to the sprint variant once the pace ramps up.
        if (stepMs <= 100 && music && !music.getVariant('snake')) music.setVariant('snake', 1);
      }
      placeFood();
    } else {
      snake.pop();
    }
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!last) last = ts;
    const dt = ts - last;
    last = ts;
    if (!alive) return;
    acc += dt;
    while (acc >= stepMs) { acc -= stepMs; step(); if (!alive) break; }
    draw();
  }

  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  function steer(d) {
    const nd = DIRS[d];
    if (!nd || !alive) return;
    if (nd.x === -dir.x && nd.y === -dir.y) return; // no 180° turns
    nextDir = nd;
  }

  function onKey(e) {
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    };
    const d = map[e.code];
    if (d) { e.preventDefault(); steer(d); }
  }

  document.addEventListener('keydown', onKey);
  container.querySelectorAll('[data-dir]').forEach((b) =>
    b.addEventListener('click', () => { audio?.click(); steer(b.dataset.dir); }));

  resetRun();
  raf = requestAnimationFrame(loop);
  // Per-game chiptune loop (2.0 host behavior): base tier at launch;
  // the speed tier kicks in when the pace ramps up.
  if (music && music.startMusic('snake')) {
    audio._bgmActive = true;
  }

  // public teardown (window close / back button)
  return function stop() {
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    if (music) {
      music.stopMusic();
      audio._bgmActive = false;
    }
  };
}
