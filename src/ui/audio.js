// Web Audio chiptune engine — SFX + per-game music loops on one small budget.
// Music runs on its own gain bus (soft vs SFX) and ducks briefly whenever a
// sound effect fires, so the loop never drowns out the juice.

const MUSIC_KEY = 'brogatchi_music';
const MUSIC_VOL_KEY = 'brogatchi_music_vol';
const SFX_VOL_KEY = 'brogatchi_sfx_vol';
const MUSIC_VOL = 0.32; // relative to master (0.2) — audible, not dominant
const DUCK_VOL = 0.12;
const BASS_VOL = 0.7;

function readVol(key, def) {
  try {
    const v = Number(window.localStorage.getItem(key));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : def;
  } catch {
    return def;
  }
}

function writeVol(key, v) {
  try {
    window.localStorage.setItem(key, String(v));
  } catch { /* private mode etc. */ }
}

// midi note number -> frequency
const n = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Simple 16-step (two bars of 8ths) loops. 0 = rest.
// lead: square; bass: triangle; hat: noise tick (offbeats).
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
};

// Variant sets per game: TRACKSETS[id][0] IS TRACKS[id] (the composer edits
// the base track live), and variants 1+ are milestone tiers the games switch
// to. They share the 16-step grid, so a switch at a bar boundary is seamless.
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
      hat:  [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 1] },
    { name: 'Vault Breach', bpm: 165,
      lead: [84, 0, 88, 0, 84, 0, 81, 0, 86, 0, 84, 0, 81, 79, 0, 81],
      bass: [57, 0, 0, 0, 55, 0, 0, 0, 53, 0, 0, 0, 52, 0, 0, 0],
      hat:  [1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0] },
  ],
};

// ---------------------------------------------------------------------
// AMBIENT ROOM LOOP — 24 hourly variants across 4 moods. The pet room
// plays this quietly while nobody's in a game; it shares the same music
// bus (and therefore the same SFX ducking) as the game tracks. Soft
// voices + low volumes keep it out of the way.
// ---------------------------------------------------------------------
const AMBIENT_MODES = {
  night: {
    bpm: 76, label: 'NIGHT FM',
    lead: [0, 12, 0, 10, 0, 7, 0, 0,  0, 12, 0, 10, 0, 7, 5, 0],
    bass: [0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 7, 0, 0, 0],
    hat:  [0, 0, 0, 1, 0, 0, 0, 1,  0, 0, 0, 1, 0, 0, 0, 1],
  },
  dawn: {
    bpm: 88, label: 'DAWN DEBUG',
    lead: [0, 0, 4, 0, 7, 0, 9, 0,  12, 0, 9, 0, 7, 0, 4, 0],
    bass: [0, 0, 0, 0, 0, 0, 0, 0,  0, 0, 0, 0, 4, 0, 0, 0],
    hat:  [0, 0, 1, 0, 0, 1, 0, 0,  0, 0, 1, 0, 0, 1, 0, 0],
  },
  day: {
    bpm: 100, label: 'DAYLIGHT',
    lead: [0, 0, 2, 4, 0, 2, 0, 0,  7, 0, 4, 2, 0, 4, 0, 0],
    bass: [0, 0, 0, 7, 0, 0, 0, 7,  0, 0, 0, 7, 0, 0, 0, 7],
    hat:  [0, 1, 0, 0, 0, 1, 0, 0,  0, 1, 0, 0, 0, 1, 0, 0],
  },
  dusk: {
    bpm: 94, label: 'GPU DRIFT',
    lead: [7, 0, 10, 0, 7, 0, 4, 0,  0, 12, 0, 10, 0, 7, 4, 0],
    bass: [0, 0, 0, 0, 0, 0, 0, 7,  0, 0, 0, 0, 0, 0, 0, 0],
    hat:  [0, 0, 0, 1, 0, 0, 0, 1,  0, 0, 0, 0, 0, 0, 1, 0],
  },
};

let weatherMood = null; // 'night' | 'dawn' | 'day' | 'dusk' | null (use clock)

export function setWeatherMood(mood) {
  mood = mood || null;
  if (mood === weatherMood) return false; // no change to report
  weatherMood = mood;
  rebuildAmbient();
  return true;
}

export function getWeatherMood() {
  return weatherMood;
}

function moodForHour(h) {
  if (weatherMood) return weatherMood;
  if (h < 5) return 'night';
  if (h < 9) return 'dawn';
  if (h < 17) return 'day';
  if (h < 21) return 'dusk';
  return 'night';
}

const TRANS_CYCLE = [0, 2, 5, 3, 0]; // gentle per-hour transpositions
const BPM_CYCLE = [0, 0, 4, 6, -2];

function buildAmbient() {
  const out = [];
  for (let h = 0; h < 24; h++) {
    const mood = moodForHour(h);
    const S = AMBIENT_MODES[mood];
    const root = 45 + TRANS_CYCLE[h % 5];
    out.push({
      name: `${String(h).padStart(2, '0')}:00 ${S.label}`,
      bpm: Math.max(40, S.bpm + BPM_CYCLE[h % 5]),
      lead: S.lead.map((d) => (d ? root + 12 + d : 0)),
      bass: S.bass.map((d) => (d ? root + d : 0)),
      hat: [...S.hat],
      soft: true,
    });
  }
  return out;
}

export const AMBIENT = buildAmbient();

// 25th variant: sleep heartbeat — ultralow tempo, one bass thump every few
// steps, no melody, no hats. Engaged while Ryan sleeps via setSleeping(true).
const SLEEP_TRACK = {
  name: 'SLEEP MODE',
  bpm: 48,
  lead: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [45, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  hat:  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  soft: true,
};
AMBIENT.push(SLEEP_TRACK);
const SLEEP_VARIANT = AMBIENT.length - 1; // index 24

if (!TRACKSETS.ambient) TRACKSETS.ambient = AMBIENT;

// Called when `setWeatherMood` changes the weather: rebuilds all 24 hourly
// variant objects in-place (mutating the existing array), so any running
// `music.track` reference from startAmbient is live-updated — no restart.
function rebuildAmbient() {
  const fresh = buildAmbient();
  for (let h = 0; h < 24; h++) {
    const dst = AMBIENT[h];
    const src = fresh[h];
    dst.name = src.name;
    dst.bpm = src.bpm;
    dst.lead = src.lead;
    dst.bass = src.bass;
    dst.hat = src.hat;
  }
  // TRACKSETS.ambient already points at AMBIENT — no reassign needed.
}

// ---- composer-friendly edit API ---------------------------------------
// Editing mutates the shared TRACKS objects in place, so the running
// sequencer picks changes up live (it reads track.lead[i] / track.bpm at
// schedule time). `ORIGINAL_TRACKS` is a pristine clone for reset.

export const ORIGINAL_TRACKS = Object.fromEntries(
  Object.entries(TRACKS).map(([id, t]) => [
    id,
    { name: t.name, bpm: t.bpm, lead: [...t.lead], bass: [...t.bass], hat: [...t.hat] },
  ])
);

export function setNote(id, lane, idx, value) {
  const t = TRACKS[id];
  if (!t || !t[lane] || !Number.isInteger(idx) || idx < 0 || idx >= t[lane].length) return false;
  if (lane === 'hat') {
    if (value !== 0 && value !== 1) return false;
  } else if (!Number.isInteger(value) || value < 0 || value > 127) {
    return false;
  }
  t[lane][idx] = value;
  return true;
}

export function setBpm(id, bpm) {
  const t = TRACKS[id];
  if (!t || !Number.isFinite(bpm)) return -1;
  t.bpm = Math.max(40, Math.min(240, Math.round(bpm)));
  return t.bpm;
}

export function resetTrack(id) {
  const t = TRACKS[id];
  const o = ORIGINAL_TRACKS[id];
  if (!t || !o) return false;
  t.bpm = o.bpm;
  t.lead = [...o.lead];
  t.bass = [...o.bass];
  t.hat = [...o.hat];
  return true;
}

export class AudioEngine {
  constructor() {
    this.musicOn = this._readMusicOn();
    this.musicVol = readVol(MUSIC_VOL_KEY, 1);
    this.sfxVol = readVol(SFX_VOL_KEY, 1);
    this.music = null; // { id, track, variant, step, nextAt, pendingVariant, timer }
    this._lastVariant = {};
    this.ambientTimer = null;
    this._ambientHour = -1;
    this._previewRestore = null;
    this._previewTimer = null;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this.ctx = Ctor ? new Ctor() : null;
      if (this.ctx) {
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.2;
        this.master.connect(this.ctx.destination);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = MUSIC_VOL * this.musicVol;
        this.musicGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxVol;
        this.sfxGain.connect(this.master);
      }
    } catch {
      this.ctx = null; // no WebAudio in this environment
    }
  }

  _readMusicOn() {
    try {
      return window.localStorage.getItem(MUSIC_KEY) !== '0';
    } catch {
      return true;
    }
  }

  _writeMusicOn(on) {
    try {
      window.localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
    } catch { /* private mode etc. */ }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---------------------------------------------------------- SFX
  playTone(freq, type, duration, vol = 1) {
    if (!this.ctx || !this.ctx.createOscillator) return;
    try {
      this.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.sfxGain || this.master);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
      this.duckMusic();
    } catch { /* audio failures are non-fatal */ }
  }

  playBeep() { this.playTone(800, 'square', 0.1, 0.5); }

  playCoin() {
    this.resume();
    this.playTone(987.77, 'square', 0.09, 0.5);
    setTimeout(() => this.playTone(1318.51, 'square', 0.15, 0.5), 85);
  }

  playHit() { this.playTone(150, 'sawtooth', 0.2, 0.8); }

  playJump() {
    if (!this.ctx || !this.ctx.createOscillator) return;
    this.resume();
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(300, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, this.ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(this.sfxGain || this.master);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.15);
      this.duckMusic();
    } catch { /* non-fatal */ }
  }

  playEat() {
    this.playTone(400, 'triangle', 0.1);
    setTimeout(() => this.playTone(300, 'triangle', 0.1), 100);
  }

  playLevelUp() {
    this.playTone(440, 'square', 0.1);
    setTimeout(() => this.playTone(554, 'square', 0.1), 100);
    setTimeout(() => this.playTone(659, 'square', 0.2), 200);
  }

  playWin() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => setTimeout(() => this.playTone(f, 'square', 0.16, 1), i * 120));
  }

  playStep() { this.playTone(600, 'triangle', 0.05, 0.3); }

  // ---------------------------------------------------------- MUSIC
  get musicEnabled() { return this.musicOn; }

  startMusic(id, variant = 0) {
    if (!this.ctx || !TRACKSETS[id]) return;
    this.resume();
    if (this.music && this.music.id === id) return; // switching handled by setVariant
    this.stopMusic();
    if (!this.musicOn) return; // muted stays muted
    const track = TRACKSETS[id][variant] || TRACKS[id];
    this.music = {
      id,
      track,
      variant,
      step: 0,
      nextAt: this.ctx.currentTime + 0.08,
      pendingVariant: null,
      timer: setInterval(() => this._scheduleMusic(), 75),
    };
    if (typeof this.music.timer.unref === 'function') this.music.timer.unref();
  }

  // Queue a variant switch; takes effect at the next bar boundary so the
  // loop stays seamless (no restart, no click). Safe to call anytime — the
  // last requested variant also wins on the next startMusic.
  setVariant(id, idx) {
    if (!TRACKSETS[id] || !TRACKSETS[id][idx]) return;
    this._lastVariant[id] = idx;
    if (this.music && this.music.id === id) this.music.pendingVariant = idx;
  }

  // Like setVariant, but fades the music bus down before the swap and back
  // up after — used for sleep→wake and wake→sleep ambient transitions so
  // the heartbeat doesn't cut in abruptly.
  crossfadeVariant(id, idx) {
    if (!TRACKSETS[id] || !TRACKSETS[id][idx]) return;
    this._lastVariant[id] = idx;
    if (this.music && this.music.id === id) {
      this.music.pendingVariant = idx;
      this.music._xfd = true;
    }
  }

  getVariant(id) {
    return this._lastVariant[id] || 0;
  }

  // ---------------------------------------------------------- AMBIENT
  // The pet-room loop: hourly variants (24 of them), quiet, same duck bus.
  // Browsers block audio before the first user gesture, so the app calls
  // this on every input — it's a cheap no-op once it's already playing.
  startAmbient(onHourChange) {
    if (!this.ctx || !TRACKSETS.ambient) return;
    this._onAmbientHourChange = onHourChange || null;
    if (!this.ambientTimer) {
      const t = setInterval(() => {
        const h = new Date().getHours();
        if (h !== this._ambientHour) {
          this._ambientHour = h;
          this.setVariant('ambient', h);
          if (this._onAmbientHourChange) this._onAmbientHourChange(h);
        }
      }, 30000); // check each half-minute; the switch waits for a bar boundary
      if (t && typeof t.unref === 'function') t.unref(); // don't hold Node tests open
      this.ambientTimer = t;
    }
    this._ambientHour = new Date().getHours();
    this.setVariant('ambient', this._ambientHour);
    if (this.musicOn) this.startMusic('ambient', this._ambientHour);
  }

  getAmbientName() {
    const h = this._ambientHour >= 0 ? this._ambientHour : new Date().getHours();
    const t = AMBIENT[h];
    return t ? t.name : '';
  }

  // Ryan's sleep: crossfade the ambient loop to a heartbeat (barely audible)
  // and back. Only matters when ambient is the active music.
  setSleeping(on) {
    if (on) {
      this._wasSleeping = true;
      if (this.music && this.music.id === 'ambient') {
        this.crossfadeVariant('ambient', SLEEP_VARIANT);
      }
    } else if (this._wasSleeping) {
      this._wasSleeping = false;
      if (this.music && this.music.id === 'ambient') {
        const h = new Date().getHours();
        this.crossfadeVariant('ambient', h);
        this._ambientHour = h;
      }
    }
  }

  // ---- crossfade helpers (sleep ↔ wake transitions) ----
  // Ramps music gain to near-zero over ~1.2s, then swaps the track and
  // ramps back up over ~1.0s. SFX ducking is paused during the fade so it
  // doesn't clobber the ramp.
  _beginCrossfade() {
    if (!this.ctx || !this.musicGain) return;
    clearTimeout(this._xfdTimer);
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setTargetAtTime(0.02, t, 0.4);
    this._xfdTimer = setTimeout(() => this._completeCrossfade(), 1400);
  }

  _completeCrossfade() {
    if (!this.music || !this.music._xfd) return;
    const nv = this.music._savedVariant;
    const nt = TRACKSETS[this.music.id] && TRACKSETS[this.music.id][nv];
    if (nt) {
      this.music.track = nt;
      this.music.variant = nv;
    }
    this.music._xfd = false;
    this.music._savedVariant = null;
    clearTimeout(this._xfdTimer);
    this._xfdTimer = null;
    if (this.musicGain) {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(MUSIC_VOL * this.musicVol, t, 0.35);
    }
  }

  // Double-click the clock: play the current hourly variant at normal volume
  // for a few bars, then restore the original music state. Safe to call any
  // time — if nothing was playing, nothing is restored.
  previewAmbient() {
    if (!this.ctx || !TRACKSETS.ambient) return false;
    if (this._previewRestore) return false; // already previewing

    const prev = this.music ? { id: this.music.id, variant: this.music.variant } : null;
    this._previewRestore = prev;

    // temporarily stop polling the hour timer (we'll resume it after)
    if (this.ambientTimer) {
      clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }

    const h = new Date().getHours();
    this.musicOn = true; // force on for the preview
    this.startMusic('ambient', h);

    // restore after ~3 bars (at ~80 BPM → ~9s)
    clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => this._endPreview(), 9000);
    return true;
  }

  _endPreview() {
    this.stopMusic();
    const prev = this._previewRestore;
    this._previewRestore = null;
    this._previewTimer = null;

    if (prev) {
      // resume whatever was playing before
      this.startMusic(prev.id, prev.variant);
      if (prev.id === 'ambient' && this._onAmbientHourChange) {
        // restart the hourly timer
        this.startAmbient(this._onAmbientHourChange);
      }
    }
  }

  stopMusic() {
    if (this.music) {
      clearInterval(this.music.timer);
      this.music = null;
    }
    if (this.ambientTimer) {
      clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    this._writeMusicOn(this.musicOn);
    if (!this.musicOn) this.stopMusic();
    return this.musicOn;
  }

  setMusic(on) {
    if (this.musicOn === !!on) return this.musicOn;
    return this.toggleMusic();
  }

  // Duck the loop under SFX for a beat. Skip if a crossfade is in flight
  // (the gain ramp would clobber our carefully-timed fade curve).
  duckMusic() {
    if (!this.ctx || !this.music || !this.musicGain) return;
    if (this.music._xfd) return;
    try {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(DUCK_VOL * this.musicVol, t, 0.02);
      this.musicGain.gain.setTargetAtTime(MUSIC_VOL * this.musicVol, t + 0.22, 0.1);
    } catch { /* non-fatal */ }
  }

  // ---------------------------------------------------------- VOLUMES
  // 0..1, persisted. Adjusting the gain nodes live applies to the current
  // loops and SFX instantly.
  setMusicVol(v) {
    this.musicVol = Math.max(0, Math.min(1, v));
    writeVol(MUSIC_VOL_KEY, this.musicVol);
    if (this.musicGain) this.musicGain.gain.value = MUSIC_VOL * this.musicVol;
    return this.musicVol;
  }

  setSfxVol(v) {
    this.sfxVol = Math.max(0, Math.min(1, v));
    writeVol(SFX_VOL_KEY, this.sfxVol);
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol;
    return this.sfxVol;
  }

  _scheduleMusic() {
    if (!this.ctx || !this.music) return;
    const horizon = this.ctx.currentTime + 0.22;
    while (this.music.nextAt < horizon) {
      const t = this.music.nextAt;

      // Apply a pending variant exactly at a bar (16-step) boundary.
      if (this.music.pendingVariant != null && this.music.step % 16 === 0) {
        const nv = this.music.pendingVariant;
        const nt = TRACKSETS[this.music.id] && TRACKSETS[this.music.id][nv];
        if (nt) {
          if (this.music._xfd) {
            // Crossfade mode: ramp down, swap after fade, then ramp up.
            this.music._savedVariant = nv;
            this.music.pendingVariant = null;
            this._beginCrossfade();
          } else {
            this.music.track = nt;
            this.music.variant = nv;
          }
        }
        if (!this.music._xfd) this.music.pendingVariant = null;
      }

      const track = this.music.track;
      const stepDur = 60 / track.bpm / 2;
      const soft = !!track.soft;
      const i = this.music.step % track.lead.length;
      // ambient uses soft voices + low volume so the room loop stays quiet
      this._note(t, track.lead[i], soft ? 'triangle' : 'square', soft ? stepDur * 1.35 : stepDur * 0.92, soft ? 0.55 : 1);
      this._note(t, track.bass[i], soft ? 'sine' : 'triangle', stepDur * 1.7, soft ? 0.3 : BASS_VOL);
      if (track.hat[i]) this._hat(t, soft ? 0.12 : 0.5);
      this.music.nextAt += stepDur;
      this.music.step++;
    }
  }

  _note(t, m, type, dur, vol) {
    if (!m) return;
    try {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = n(m);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.01, t + dur);
      osc.connect(g);
      g.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* non-fatal */ }
  }

  _hat(t, vol = 0.5) {
    try {
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.05);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.musicGain);
      src.start(t);
    } catch { /* non-fatal */ }
  }
}

