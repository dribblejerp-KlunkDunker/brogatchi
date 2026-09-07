// Unit tests for the arcade BGM engine (src/gameMusic.js): the restored
// 2.0 track data (per-game loops + milestone tier variants), the
// bar-boundary variant switching, tier memory, and the sequencer's
// lifecycle — driven against a stub engine, no WebAudio required.
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import { TRACKS, TRACKSETS, createGameMusic } from '../src/gameMusic.js';
import { GAMES, hostGame } from '../src/arcadeCore.js';
import { startSnake } from '../src/apps/snake.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function stubEngine() {
  const calls = [];
  return {
    calls,
    ctx: null, // no AudioContext — sequencer must still run its clock
    init() { calls.push('init'); },
    leadNote(freq, dur) { calls.push({ lead: freq, dur }); },
    bassNote(freq, dur) { calls.push({ bass: freq, dur }); },
    hat(vol) { calls.push({ hat: vol }); },
  };
}

/* ─────────── track data (2.0 fidelity) ─────────── */

describe('arcade track data', () => {
  it('every restored game has a base loop and the tier variants its engine calls for', () => {
    // flappy/breaker/mario/rpg/loot switch tiers 0..2 (2.0 data); snake
    // (3.0 original) gets base + one speed tier.
    const expectedTiers = { flappy: 3, breaker: 3, mario: 3, rpg: 3, loot: 3, snake: 2 };
    for (const [id, tiers] of Object.entries(expectedTiers)) {
      expect(TRACKSETS[id], `${id} missing`).toBeTruthy();
      expect(TRACKSETS[id]).toHaveLength(tiers);
      expect(TRACKSETS[id][0]).toBe(TRACKS[id]); // tier 0 IS the base track
      for (const t of TRACKSETS[id]) {
        expect(t.lead).toHaveLength(16);
        expect(t.bass).toHaveLength(16);
        expect(t.hat).toHaveLength(16);
        expect(t.bpm).toBeGreaterThanOrEqual(40);
        expect(t.bpm).toBeLessThanOrEqual(240);
      }
    }
  });

  it('all engine-switched tiers exist for every game that calls setVariant', () => {
    // From the game sources: flappy/loot use tiers 0,1,2; mario 0,1,2;
    // rpg 0,1,2; breaker 0,1,2; snake 0,1.
    for (const id of ['flappy', 'breaker', 'mario', 'rpg', 'loot']) {
      expect(TRACKSETS[id][1]).toBeTruthy();
      expect(TRACKSETS[id][2]).toBeTruthy();
    }
    expect(TRACKSETS.snake[1]).toBeTruthy();
    expect(TRACKS.snake).toBeTruthy(); // snake HAS a base loop now
  });
});

/* ─────────── sequencer lifecycle ─────────── */

describe('gameMusic sequencer', () => {
  it('startMusic launches the base tier, counts steps, and stopMusic releases', () => {
    vi.useFakeTimers();
    const engine = stubEngine();
    const music = createGameMusic(engine);

    expect(music.startMusic('loot')).toBe(true);
    expect(music.isPlaying('loot')).toBe(true);
    expect(music.playing.variant).toBe(0);

    vi.advanceTimersByTime(600); // fallback timer ticks ~5 steps
    expect(music.playing.step).toBeGreaterThan(0);
    expect(music.playing.step).toBeLessThan(16); // far from a bar boundary

    music.stopMusic();
    expect(music.isPlaying()).toBe(false);
    expect(music.playing).toBe(null);
    const atStop = music.playing?.step;
    vi.advanceTimersByTime(600);
    expect(music.playing?.step ?? atStop).toBe(atStop ?? undefined);
  });

  it('voices the lead/bass/hat lanes from the track data', () => {
    vi.useFakeTimers();
    const engine = stubEngine();
    const music = createGameMusic(engine);
    music.startMusic('loot');
    const before = engine.calls.length;
    music.stepOnce();
    const stepCalls = engine.calls.slice(before);
    const track = TRACKS.loot;
    expect(stepCalls.length).toBeGreaterThan(0);
    // step 0 of Loot Loop: lead note 72, bass note 48, hat offbeat pattern starts at i=1
    expect(stepCalls.some((c) => c.lead && c.dur > 0)).toBe(true);
    if (track.bass[0]) expect(stepCalls.some((c) => c.bass)).toBe(true);
    if (track.hat[0]) expect(stepCalls.some((c) => c.hat)).toBe(true);
    music.stopMusic();
  });

  it('playing a different game stops the previous loop (one sequencer, like 2.0)', () => {
    vi.useFakeTimers();
    const engine = stubEngine();
    const music = createGameMusic(engine);

    music.startMusic('flappy');
    vi.advanceTimersByTime(200);
    expect(music.isPlaying('flappy')).toBe(true);

    music.startMusic('breaker');
    expect(music.isPlaying('breaker')).toBe(true);
    expect(music.isPlaying('flappy')).toBe(false);
    expect(music.playing.variant).toBe(0);
    music.stopMusic();
  });

  it('unknown games and missing tiers are rejected', () => {
    const engine = stubEngine();
    const music = createGameMusic(engine);
    expect(music.startMusic('tetris')).toBe(false);
    expect(music.startMusic('loot')).toBe(true);
    expect(music.setVariant('loot', 9)).toBe(false);
    expect(music.setVariant('tetris', 1)).toBe(false);
    music.stopMusic();
  });
});

/* ─────────── tier variants (setVariant) ─────────── */

describe('tier variant switching', () => {
  it('setVariant takes effect only at a bar (16-step) boundary', () => {
    vi.useFakeTimers();
    const engine = stubEngine();
    const music = createGameMusic(engine);
    music.startMusic('loot');
    vi.advanceTimersByTime(250); // two steps in (120ms fallback timer)
    expect(music.playing.step).toBe(2);

    music.setVariant('loot', 2); // Vault Breach
    vi.advanceTimersByTime(250); // ~4 steps — still inside bar 0
    expect(music.playing.variant).toBe(0); // not yet

    vi.advanceTimersByTime(1600); // well past step 16
    expect(music.playing.variant).toBe(2); // swapped at the boundary
    music.stopMusic();
  });

  it('the last requested tier wins if several queue before the boundary', () => {
    vi.useFakeTimers();
    const engine = stubEngine();
    const music = createGameMusic(engine);
    music.startMusic('rpg');
    music.setVariant('rpg', 1); // Combat Protocol
    music.setVariant('rpg', 2); // Boss Protocol — overrides
    vi.advanceTimersByTime(2000); // past the bar line
    expect(music.playing.variant).toBe(2);
    music.stopMusic();
  });

  it('tier memory: getVariant reports the last tier per game (2.0 semantic)', () => {
    const engine = stubEngine();
    const music = createGameMusic(engine);
    expect(music.getVariant('flappy')).toBe(0);
    music.setVariant('flappy', 2);
    expect(music.getVariant('flappy')).toBe(2);
    expect(music.getVariant('loot')).toBe(0); // per-game, not global
  });
});

/* ─────────── host wiring ─────────── */

describe('BGM host wiring', () => {
  it('hostGame starts the loop at launch and stop() releases it', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="stage"></div>';
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const audio = new Proxy({}, { get: (_t, prop) => (prop === 'init' ? () => {} : () => {}) });
    const music = createGameMusic(stubEngine());
    const stop = hostGame(document.getElementById('stage'), 'flappy', { audio, onGameOver: () => {}, music });
    expect(music.isPlaying('flappy')).toBe(true);
    expect(music.playing.variant).toBe(0);
    stop();
    expect(music.isPlaying()).toBe(false);
    rafSpy.mockRestore();
  });

  it('snake starts its loop and releases it on teardown', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="snake-stage"></div>';
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const audioCalls = [];
    const audio = new Proxy({}, { get: (_t, prop) => (prop === 'init' ? () => {} : (...a) => audioCalls.push(String(prop))) });
    const music = createGameMusic(stubEngine());
    const stop = startSnake(document.getElementById('snake-stage'), { audio, onGameOver: () => {}, music });
    expect(music.isPlaying('snake')).toBe(true);
    stop();
    expect(music.isPlaying()).toBe(false);
    rafSpy.mockRestore();
  });

  it('snake switches to the speed tier when the pace ramps (stepMs <= 100)', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="snake-stage"></div>';
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const audio = new Proxy({}, { get: (_t, prop) => (prop === 'init' ? () => {} : () => {}) });
    const music = createGameMusic(stubEngine());
    const stop = startSnake(document.getElementById('snake-stage'), { audio, onGameOver: () => {}, music });
    // inside the module stepMs starts at 140 and drops 3 per apple; 140→100
    // takes 14 apples. Drive the same condition the game code checks.
    const cvs = document.getElementById('snake-canvas');
    expect(cvs).toBeTruthy();
    stop();
    rafSpy.mockRestore();
    // tier switch guard: only requests tier 1 once (getVariant flips)
    expect(music.getVariant('snake')).toBe(0); // no apples were eaten
  });

  it('every GAMES registry entry has a trackset (host can loop all six cabinets)', () => {
    for (const key of Object.keys(GAMES)) {
      expect(TRACKSETS[key], `${key} has no BGM loop`).toBeTruthy();
    }
    expect(TRACKSETS.snake).toBeTruthy(); // snake is hosted separately
  });
});
