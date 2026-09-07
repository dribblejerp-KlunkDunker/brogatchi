// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/gameMusic.js — ARCADE CHIPTUNE BGM
// Restored from the 2.0 audio engine: every game gets a 16-step
// (two bars of 8ths) loop, and TRACKSETS[id][1+] are the milestone
// tiers the games switch to via setVariant(). Track data is the
// 2.0 original; the sequencer drives the 3.0 synth's music voices
// (square lead, triangle bass, noise hat) on the BGM volume bus.
// ═══════════════════════════════════════════════════════════

// midi note number -> frequency
const n = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Simple 16-step loops. 0 = rest. lead: square; bass: triangle;
// hat: noise tick (offbeats). Data verbatim from 2.0's src/ui/audio.js.
export const TRACKS = {
  flappy: {
    name: 'Night Raid',
    bpm: 105,
    lead: [69, 0, 76, 0, 81, 76, 0, 0, 69, 0, 76, 0, 79, 0, 76, 72],
    bass: [45, 0, 0, 45, 0, 0, 45, 0, 41, 0, 0, 41, 0, 0, 41, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  },
  breaker: {
    name: 'Brick Beats',
    bpm: 138,
    lead: [79, 0, 77, 0, 76, 0, 72, 0, 77, 0, 76, 0, 74, 0, 72, 0],
    bass: [48, 0, 48, 0, 0, 0, 48, 0, 45, 0, 45, 0, 0, 0, 45, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  },
  mario: {
    name: 'Super Bro Theme',
    bpm: 132,
    lead: [72, 0, 76, 0, 79, 76, 84, 0, 81, 76, 0, 79, 0, 76, 72, 0],
    bass: [48, 0, 0, 55, 0, 0, 48, 0, 45, 0, 0, 52, 0, 0, 45, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  },
  rpg: {
    name: 'Mainframe March',
    bpm: 112,
    lead: [64, 0, 67, 0, 71, 0, 67, 0, 62, 0, 65, 67, 0, 69, 0, 64],
    bass: [40, 0, 40, 0, 40, 0, 40, 0, 38, 0, 38, 0, 38, 0, 38, 0],
    hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  },
  loot: {
    name: 'Loot Loop',
    bpm: 120,
    lead: [72, 0, 76, 0, 79, 76, 0, 0, 72, 0, 74, 0, 76, 0, 79, 76],
    bass: [48, 0, 0, 48, 0, 0, 48, 0, 45, 0, 0, 45, 0, 0, 45, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  },
  // 3.0 original: snake never called setVariant in 2.0, but it does
  // accelerate — so it gets a base loop plus one speed tier.
  snake: {
    name: 'Serpent Groove',
    bpm: 128,
    lead: [69, 0, 72, 0, 76, 0, 72, 0, 79, 0, 76, 0, 72, 0, 74, 0],
    bass: [45, 0, 0, 0, 52, 0, 0, 0, 43, 0, 0, 0, 50, 0, 0, 0],
    hat: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0],
  },
};

// Variant sets per game: TRACKSETS[id][0] IS TRACKS[id] (the base
// loop), and variants 1+ are the milestone tiers the games switch
// to at score/level/phase thresholds. They share the 16-step grid,
// so a switch at a bar boundary is seamless. Data verbatim from 2.0.
export const TRACKSETS = {
  flappy: [
    TRACKS.flappy,
    { name: 'Night Chase', bpm: 132,
      lead: [69, 0, 72, 0, 76, 72, 0, 0, 69, 0, 72, 0, 74, 0, 72, 0],
      bass: [45, 0, 45, 0, 0, 0, 45, 0, 43, 0, 43, 0, 0, 0, 43, 0],
      hat:  [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1] },
    { name: 'Danger Zone', bpm: 155,
      lead: [76, 0, 79, 0, 81, 0, 79, 76, 76, 0, 79, 0, 84, 0, 81, 0],
      bass: [48, 0, 0, 48, 0, 0, 48, 0, 48, 0, 0, 48, 0, 0, 48, 0],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
  ],
  breaker: [
    TRACKS.breaker,
    { name: 'Level Surge', bpm: 150,
      lead: [72, 76, 79, 76, 71, 76, 76, 0, 79, 76, 74, 76, 72, 0, 71, 72],
      bass: [48, 0, 0, 48, 0, 0, 48, 0, 43, 0, 0, 43, 0, 0, 43, 0],
      hat:  [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1] },
    { name: 'Final Bounce', bpm: 138,
      lead: [84, 0, 79, 0, 84, 0, 79, 0, 81, 0, 84, 0, 79, 0, 76, 0],
      bass: [48, 0, 0, 0, 48, 0, 0, 0, 47, 0, 0, 0, 45, 0, 0, 0],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
  ],
  mario: [
    TRACKS.mario,
    { name: 'Coin Rush', bpm: 142,
      lead: [79, 0, 76, 0, 84, 0, 81, 0, 76, 0, 74, 76, 72, 0, 76, 0],
      bass: [52, 0, 0, 0, 52, 0, 0, 48, 48, 0, 0, 0, 48, 0, 0, 48],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
    { name: 'End Goal', bpm: 164,
      lead: [81, 0, 84, 0, 88, 0, 84, 81, 79, 0, 84, 0, 81, 0, 79, 0],
      bass: [55, 0, 0, 0, 48, 0, 0, 0, 55, 0, 0, 0, 48, 0, 0, 0],
      hat:  [0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1] },
  ],
  rpg: [
    TRACKS.rpg,
    { name: 'Combat Protocol', bpm: 124,
      lead: [76, 64, 67, 0, 64, 0, 67, 0, 62, 65, 69, 0, 65, 0, 69, 64],
      bass: [36, 0, 36, 0, 0, 0, 36, 0, 38, 0, 38, 0, 0, 0, 38, 0],
      hat:  [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1] },
    { name: 'Boss Protocol', bpm: 140,
      lead: [76, 0, 76, 0, 72, 0, 76, 0, 75, 0, 75, 0, 72, 0, 75, 0],
      bass: [43, 43, 0, 0, 43, 0, 0, 0, 40, 40, 0, 0, 40, 0, 0, 0],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
  ],
  loot: [
    TRACKS.loot,
    { name: 'Drip Rush', bpm: 148,
      lead: [76, 0, 79, 0, 84, 0, 79, 0, 74, 0, 79, 0, 81, 0, 79, 76],
      bass: [52, 0, 0, 52, 0, 0, 52, 0, 48, 0, 0, 48, 0, 0, 48, 0],
      hat:  [0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1] },
    { name: 'Vault Breach', bpm: 165,
      lead: [84, 0, 88, 0, 84, 0, 81, 0, 86, 0, 84, 0, 81, 79, 0, 81],
      bass: [57, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 52, 0, 0, 0],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0] },
  ],
  snake: [
    TRACKS.snake,
    { name: 'Cobra Sprint', bpm: 150,
      lead: [81, 0, 84, 0, 81, 79, 0, 76, 77, 0, 81, 0, 84, 0, 79, 0],
      bass: [45, 0, 45, 0, 48, 0, 48, 0, 43, 0, 43, 0, 47, 0, 47, 0],
      hat:  [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1] },
  ],
};

/**
 * Create the arcade music sequencer bound to an AudioEngine.
 * The engine supplies `init()`, `ctx`, and the music voices
 * (leadNote/bassNote/hat). With no WebAudio context (jsdom, or no
 * gesture yet) the sequencer still runs on a fallback timer so
 * tests and state remain observable — the voices simply no-op.
 */
export function createGameMusic(engine) {
  let playing = null; // { id, track, variant, step, nextAt, pendingVariant, timer }
  const lastVariant = {}; // per-game tier memory: last tier wins on restart

  function startMusic(id, variant = 0) {
    const set = TRACKSETS[id];
    if (!set) return false;
    if (playing && playing.id === id) {
      // same game already looping — just honor a tier request
      if (set[variant] && variant !== playing.variant) setVariant(id, variant);
      return true;
    }
    stopMusic();
    const v = set[variant] ? variant : 0;
    playing = { id, track: set[v], variant: v, step: 0, nextAt: null, pendingVariant: null, timer: null };
    lastVariant[id] = v;
    engine.init?.();
    if (engine.ctx) {
      // Drift-corrected look-ahead scheduling on the AudioContext clock.
      playing.nextAt = engine.ctx.currentTime + 0.08;
      playing.timer = setInterval(() => schedule(), 60);
    } else {
      // jsdom / pre-gesture fallback: keep the step clock so tests and
      // variant boundaries behave identically; voices no-op without a ctx.
      playing.timer = setInterval(() => stepOnce(), 120);
    }
    if (typeof playing.timer.unref === 'function') playing.timer.unref();
    return true;
  }

  function stopMusic() {
    if (playing?.timer) clearInterval(playing.timer);
    playing = null;
  }

  // Queue a variant switch; takes effect at the next bar (16-step)
  // boundary so the loop stays seamless. getVariant() reports the last
  // requested tier per game (informational, as in 2.0 — the host always
  // relaunches at the base tier).
  function setVariant(id, idx) {
    if (!TRACKSETS[id] || !TRACKSETS[id][idx]) return false;
    lastVariant[id] = idx;
    if (playing && playing.id === id) playing.pendingVariant = idx;
    return true;
  }

  function getVariant(id) {
    return lastVariant[id] || 0;
  }

  function isPlaying(id) {
    return !!playing && (id == null || playing.id === id);
  }

  // Advance one step and voice it. Called by the schedule loop with an
  // exact AudioContext time, or bare (engine uses currentTime) by the
  // fallback timer / tests.
  function playStep(at) {
    if (!playing) return;
    // Variant swap lands exactly on a bar boundary.
    if (playing.pendingVariant != null && playing.step % 16 === 0) {
      const nt = TRACKSETS[playing.id]?.[playing.pendingVariant];
      if (nt) {
        playing.track = nt;
        playing.variant = playing.pendingVariant;
      }
      playing.pendingVariant = null;
    }
    const t = playing.track;
    const i = playing.step % t.lead.length;
    const stepDur = 60 / t.bpm / 2; // 8th notes
    if (t.lead[i]) engine.leadNote(n(t.lead[i]), stepDur * 0.92, at);
    if (t.bass[i]) engine.bassNote(n(t.bass[i]), stepDur * 1.7, at);
    if (t.hat[i]) engine.hat(0.5, at);
    playing.step++;
  }

  function stepOnce() { playStep(); }

  function schedule() {
    if (!playing || !engine.ctx) return;
    const horizon = engine.ctx.currentTime + 0.2;
    let guard = 0;
    while (playing.nextAt < horizon && guard++ < 32) {
      playStep(playing.nextAt);
      playing.nextAt += 60 / playing.track.bpm / 2;
    }
  }

  return {
    startMusic,
    stopMusic,
    setVariant,
    getVariant,
    isPlaying,
    stepOnce,
    schedule,
    get playing() {
      return playing ? { id: playing.id, variant: playing.variant, step: playing.step } : null;
    },
  };
}
