// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/audio.js — CHIPTUNE AUDIO ENGINE
// Zero-asset Web Audio synthesizer. Every UI sound in the OS is
// generated on the fly — no MP3s, just square waves and memories.
// ═══════════════════════════════════════════════════════════

// Arcade BGM bus level (music voices; scaled by vol.bgm at voice time).
const MUSIC_LEVEL = 0.16;

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.sfxVolume = 0.8;   // 0..1, scaled onto preset volumes
    this.bgmVolume = 0.7;   // used by the sequencer/synth bus
  }

  // Must be called from a user gesture (browser autoplay policy).
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx?.state === 'suspended') this.ctx.resume();
    // Dedicated music bus: arcade BGM routes here so SFX can duck it.
    if (this.ctx && !this.musicGain) {
      try {
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 1;
        this.musicGain.connect(this.ctx.destination);
      } catch { this.musicGain = null; }
    }
  }

  setSfxVolume(v) { this.sfxVolume = Math.min(1, Math.max(0, v)); }
  setBgmVolume(v) { this.bgmVolume = Math.min(1, Math.max(0, v)); }

  // Core synth voice
  playTone(freq, type = 'square', duration = 0.1, vol = 0.08) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(Math.max(0.0001, vol), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    } catch { /* audio is decoration — never let it crash the OS */ }
  }

  // SFX voice: preset volume × user SFX volume
  sfx(freq, type, dur, base) {
    this.playTone(freq, type, dur, base * this.sfxVolume);
    this.duckMusic(); // juice: BGM ducks briefly under every SFX
  }

  /* ─────────── UI SFX PRESETS ─────────── */

  click()        { this.sfx(800, 'square', 0.05, 0.05); }
  hover()        { this.sfx(1200, 'square', 0.02, 0.02); }
  deny()         { this.error(); }

  windowOpen() {
    this.sfx(400, 'square', 0.05, 0.07);
    setTimeout(() => this.sfx(600, 'square', 0.05, 0.07), 50);
  }

  windowClose() {
    this.sfx(600, 'square', 0.05, 0.07);
    setTimeout(() => this.sfx(300, 'square', 0.1, 0.07), 50);
  }

  coin() {
    this.sfx(988, 'square', 0.1, 0.09);
    setTimeout(() => this.sfx(1319, 'square', 0.2, 0.09), 100);
  }

  error() { this.sfx(150, 'sawtooth', 0.2, 0.12); }

  eat() {
    this.sfx(300, 'square', 0.06, 0.08);
    setTimeout(() => this.sfx(220, 'square', 0.08, 0.08), 70);
  }

  pet() { this.sfx(1046, 'triangle', 0.08, 0.06); }

  sleep() { this.sfx(392, 'triangle', 0.3, 0.05); }

  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this.sfx(f, 'square', 0.12, 0.09), i * 90));
  }

  hack() {
    // Rapid random frequencies — "decryption" scramble
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.sfx(200 + Math.random() * 800, 'sawtooth', 0.05, 0.06), i * 40);
    }
  }

  typeBlip() { this.sfx(1400 + Math.random() * 400, 'square', 0.02, 0.02); }

  // Sequencer note (bgm bus)
  note(freq, dur = 0.15) {
    this.playTone(freq, 'square', dur, 0.06 * this.bgmVolume);
  }

  /* ─────────── ARCADE MUSIC VOICES ───────────
     Driven by the gameMusic sequencer (src/gameMusic.js): the
     arcade BGM loops route through these voices on the dedicated
     music bus, so SFX can duck the loop without touching it.
     `at` lets the sequencer schedule on the AudioContext clock. */

  leadNote(freq, dur = 0.15, at = null) {
    this._musicTone(freq, 'square', dur, 1, at);
  }

  bassNote(freq, dur = 0.25, at = null) {
    this._musicTone(freq, 'triangle', dur, 0.7, at);
  }

  hat(vol = 0.5, at = null) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = at ?? this.ctx.currentTime;
      const sr = this.ctx.sampleRate;
      const len = Math.floor(sr * 0.05);
      const buf = this.ctx.createBuffer(1, len, sr);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = vol * MUSIC_LEVEL * this.bgmVolume;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      src.connect(hp);
      hp.connect(g);
      g.connect(this.musicGain || this.ctx.destination);
      src.start(t);
    } catch { /* audio is decoration — never let it crash the OS */ }
  }

  _musicTone(freq, type, dur, rel, at = null) {
    if (!this.enabled || !this.ctx) return;
    try {
      const t = at ?? this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(MUSIC_LEVEL * rel * this.bgmVolume, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.01, t + dur);
      osc.connect(g);
      g.connect(this.musicGain || this.ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* audio is decoration — never let it crash the OS */ }
  }

  // Duck the BGM bus under an SFX for a beat (2.0 juicing behavior).
  // No-op unless the arcade sequencer has flagged music as active.
  duckMusic() {
    if (!this.ctx || !this.musicGain || !this._bgmActive) return;
    try {
      const t = this.ctx.currentTime;
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(0.3, t, 0.02);
      this.musicGain.gain.setTargetAtTime(1, t + 0.22, 0.1);
    } catch { /* non-fatal */ }
  }
}

export const audio = new AudioEngine();
