// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/audio.js — CHIPTUNE AUDIO ENGINE
// Zero-asset Web Audio synthesizer. Every UI sound in the OS is
// generated on the fly — no MP3s, just square waves and memories.
// ═══════════════════════════════════════════════════════════

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
}

export const audio = new AudioEngine();
