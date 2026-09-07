// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/arcadeCore.js — GAME HOST LAYER
// Bridges the 2.0 game engine suite (src/games/*) onto the 3.0
// shell: adapts the 3.0 chiptune audio engine to the play* /
// setVariant API the games expect, and hosts runs inside the
// arcade window (canvas scaling, HUD, keyboard guard, pointer
// mapping, payouts through the store).
// ═══════════════════════════════════════════════════════════

import { VIEW_W, VIEW_H } from './games/GameBase.js';
import { FlappyGame } from './games/flappy.js';
import { BreakerGame } from './games/breaker.js';
import { MarioGame } from './games/mario.js';
import { RPGGame } from './games/rpg.js';
import { LootGame } from './games/loot.js';

export const GAMES = {
  flappy: { cls: FlappyGame, name: 'FLAPPY.BRO', icon: '🐦', pad: false },
  breaker: { cls: BreakerGame, name: 'BREAKER.EXE', icon: '🧱', pad: false },
  mario: { cls: MarioGame, name: 'SUPER BRO LAND', icon: '🍄', pad: true },
  rpg: { cls: RPGGame, name: 'FINAL BRO-TASY', icon: '⚔️', pad: false },
  loot: { cls: LootGame, name: 'LOOT SHOWER', icon: '🪙', pad: true },
};

// The 2.0 games call a richer audio API than 3.0's engine exposes.
// This adapter maps every call onto the existing chiptune presets —
// no new sounds needed, just routing. `variant` changes (music tiers)
// are acknowledged silently: 3.0's synth has no per-game BGM loops yet.
function adaptAudio(audio) {
  return {
    playJump: () => audio.pet(),
    playCoin: () => audio.coin(),
    playHit: () => audio.error(),
    playEat: () => audio.eat(),
    playBeep: () => audio.typeBlip(),
    playWin: () => audio.levelUp(),
    playLevelUp: () => audio.levelUp(),
    setVariant: () => {},           // music tier switch — no-op on 3.0
    startMusic: () => {}, stopMusic: () => {},
    init: () => audio.init(),
  };
}

// Host one run of `gameKey` inside `container`. Returns a stop() teardown
// that cancels the loop, unbinds input, and restores the OS keyboard.
export function hostGame(container, gameKey, { audio, onGameOver }) {
  const def = GAMES[gameKey];
  if (!def) return () => {};

  container.innerHTML = `
    <div class="flex flex-col items-center gap-2 h-full">
      <div class="w-full flex justify-between font-mono text-[10px] shrink-0">
        <span class="text-neon-green text-glow-green">${def.name} // RUNNING</span>
        <span class="text-text-muted">
          SCORE <span id="game-score" class="text-neon-cyan">0</span> ·
          <span id="game-lives" class="text-neon-magenta">❤️❤️❤️</span>
        </span>
      </div>
      <canvas id="game-canvas" width="${VIEW_W}" height="${VIEW_H}"
        class="border border-neon-green/40 bg-void max-w-full max-h-[60vh] w-auto"
        style="image-rendering:pixelated; touch-action:none" aria-label="${def.name} playfield"></canvas>
      ${def.pad ? `
      <div class="grid grid-cols-3 gap-1 w-40 select-none" aria-label="Virtual gamepad">
        <span></span>
        <button id="btn-jump" class="btn-cyber text-[10px]">▲</button>
        <span></span>
        <button id="btn-left" class="btn-cyber text-[10px]">◀</button>
        <button id="btn-down" class="btn-cyber text-[10px]">▼</button>
        <button id="btn-right" class="btn-cyber text-[10px]">▶</button>
      </div>` : ''}
      <p class="font-mono text-[9px] text-text-muted text-center shrink-0">
        ${def.pad ? 'ARROWS / WASD MOVE · ▲ / SPACE JUMPS · DRAG TO STEER' : 'TAP / CLICK / ARROWS TO PLAY'}
      </p>
    </div>`;

  const cvs = container.querySelector('#game-canvas');
  // GameBase calls app.onGameOver(key, score, reward) — normalize to the
  // documented host callback contract onGameOver(score, reward).
  const game = new def.cls(
    { audio: adaptAudio(audio), onGameOver: (key, score, reward) => onGameOver(score, reward) },
    cvs,
  );
  // Debug/test hook: lets the shell (and vitest) reach the live instance.
  cvs.__game = game;

  // Keep OS hotkeys (Esc window close, arrow scroll) from fighting the game.
  const swallow = (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
  };

  // Pointer events → internal 400×600 coords (canvas may be CSS-scaled).
  const toGameCoords = (e) => {
    const rect = cvs.getBoundingClientRect();
    const cx = e.touches?.length ? e.touches[0].clientX : e.clientX;
    const cy = e.touches?.length ? e.touches[0].clientY : e.clientY;
    if (cx == null) return null;
    return {
      x: (cx - rect.left) * (cvs.width / rect.width),
      y: (cy - rect.top) * (cvs.height / rect.height),
    };
  };
  const onDown = (e) => { e.preventDefault(); const p = toGameCoords(e); if (p) game.onPointer(p.x, p.y, e); };
  const onMove = (e) => { const p = toGameCoords(e); if (p) game.onPointerMove(p.x, p.y, e); };

  cvs.addEventListener('pointerdown', onDown);
  cvs.addEventListener('pointermove', onMove);
  document.addEventListener('keydown', swallow, true);

  game.start();

  return function stop() {
    game.stop();
    cvs.removeEventListener('pointerdown', onDown);
    cvs.removeEventListener('pointermove', onMove);
    document.removeEventListener('keydown', swallow, true);
  };
}
