// @vitest-environment node
// Chiptune track bank sanity + mute toggle behavior (no WebAudio in node:
// the engine must degrade to safe no-ops everywhere).
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioEngine, TRACKS, TRACKSETS, AMBIENT, ORIGINAL_TRACKS, setNote, setBpm, resetTrack } from '../src/ui/audio.js';

describe('TRACKS bank', () => {
  it('has one track per mini-game', () => {
    expect(Object.keys(TRACKS).sort()).toEqual(['breaker', 'flappy', 'loot', 'mario', 'rpg']);
  });

  it('every track has equal-length, number-only lead/bass/hat arrays', () => {
    for (const [id, t] of Object.entries(TRACKS)) {
      expect(t.bpm, `${id} bpm`).toBeGreaterThan(0);
      const len = t.lead.length;
      expect(len, `${id} lead`).toBeGreaterThan(0);
      expect(t.bass.length, `${id} bass`).toBe(len);
      expect(t.hat.length, `${id} hat`).toBe(len);
      for (const v of t.lead) expect(typeof v, `${id} lead val`).toBe('number');
      for (const v of t.bass) expect(typeof v, `${id} bass val`).toBe('number');
      for (const v of t.hat) expect([0, 1], `${id} hat val`).toContain(v);
      // a lead line that is all rests would be a silent loop
      expect(t.lead.some((v) => v > 0), `${id} has melody`).toBe(true);
    }
  });
});

describe('AudioEngine without WebAudio', () => {
  let eng;
  beforeEach(() => { eng = new AudioEngine(); });

  it('is constructed safely and defaults music on', () => {
    expect(eng.ctx).toBeNull();
    expect(eng.musicEnabled).toBe(true);
  });

  it('startMusic/stopMusic are safe no-ops', () => {
    expect(() => eng.startMusic('mario')).not.toThrow();
    expect(eng.music).toBeNull();
    expect(() => eng.stopMusic()).not.toThrow();
    expect(() => eng.startMusic('nope')).not.toThrow();
  });

  it('toggleMusic flips the persisted preference', () => {
    expect(eng.toggleMusic()).toBe(false);
    expect(eng.musicEnabled).toBe(false);
    // muted music must not start
    eng.startMusic('mario');
    expect(eng.music).toBeNull();
    expect(eng.toggleMusic()).toBe(true);
    expect(eng.musicEnabled).toBe(true);
  });

  it('every SFX method is a safe no-op', () => {
    for (const m of ['playTone', 'playBeep', 'playCoin', 'playHit', 'playJump', 'playEat', 'playLevelUp', 'playWin', 'playStep', 'resume', 'duckMusic']) {
      expect(() => eng[m](), m).not.toThrow();
    }
  });

  it('volume setters clamp to 0..1 and are safe no-ops without ctx', () => {
    expect(eng.setMusicVol(0.4)).toBeCloseTo(0.4);
    expect(eng.musicVol).toBeCloseTo(0.4);
    expect(eng.setSfxVol(0.2)).toBeCloseTo(0.2);
    expect(eng.sfxVol).toBeCloseTo(0.2);
    expect(eng.setMusicVol(2)).toBe(1);
    expect(eng.setSfxVol(-1)).toBe(0);
    expect(() => eng.setMusicVol(0.5)).not.toThrow();
  });
});

describe('composer edit API', () => {
  it('setNote validates and writes into the live track', () => {
    expect(setNote('mario', 'lead', 0, 60)).toBe(true);
    expect(TRACKS.mario.lead[0]).toBe(60);
    // bad lane / bad idx / out-of-range value
    expect(setNote('mario', 'hat', 0, 2)).toBe(false);
    expect(setNote('mario', 'lead', 99, 60)).toBe(false);
    expect(setNote('mario', 'lead', 0, 128)).toBe(false);
    expect(setNote('nope', 'lead', 0, 60)).toBe(false);
    expect(setNote('mario', 'lead', 0, 'x')).toBe(false);
  });

  it('hat lane only accepts 0/1', () => {
    expect(setNote('flappy', 'hat', 3, 1)).toBe(true);
    expect(TRACKS.flappy.hat[3]).toBe(1);
    expect(setNote('flappy', 'hat', 3, 2)).toBe(false);
  });

  it('setBpm clamps to 40..240', () => {
    expect(setBpm('rpg', 999)).toBe(240);
    expect(setBpm('rpg', 1)).toBe(40);
    expect(setBpm('rpg', 112)).toBe(112);
    expect(setBpm('nope', 100)).toBe(-1);
  });

  it('resetTrack restores a pristine copy', () => {
    setNote('breaker', 'lead', 7, 71);
    setBpm('breaker', 200);
    resetTrack('breaker');
    expect(TRACKS.breaker.lead).toEqual(ORIGINAL_TRACKS.breaker.lead);
    expect(TRACKS.breaker.bpm).toBe(ORIGINAL_TRACKS.breaker.bpm);
  });
});

describe('TRACKSETS variants', () => {
  it('every game has 3 variants and variant 0 IS the base track', () => {
    for (const id of Object.keys(TRACKS)) {
      expect(TRACKSETS[id], `${id} variant count`).toHaveLength(3);
      expect(TRACKSETS[id][0]).toBe(TRACKS[id]);
    }
  });

  it('every variant has equal-length, number-only, 16-step arrays + a melody', () => {
    for (const [id, set] of Object.entries(TRACKSETS)) {
      set.forEach((t, vi) => {
        expect(t.lead.length, `${id}[${vi}] lead`).toBe(16);
        expect(t.bass.length, `${id}[${vi}] bass`).toBe(16);
        expect(t.hat.length, `${id}[${vi}] hat`).toBe(16);
        for (const lane of ['lead', 'bass', 'hat']) {
          for (const v of t[lane]) expect(typeof v, `${id}[${vi}] ${lane}`).toBe('number');
        }
        for (const v of t.hat) expect([0, 1], `${id}[${vi}] hat`).toContain(v);
        const isSleep = id === 'ambient' && vi === 24;
        if (!isSleep) expect(t.lead.some((v) => v > 0), `${id}[${vi}] has melody`).toBe(true);
        expect(t.bpm, `${id}[${vi}] bpm`).toBeGreaterThan(0);
      });
    }
  });

  it('engine records variants without WebAudio', () => {
    const eng = new AudioEngine();
    expect(eng.getVariant('mario')).toBe(0);
    eng.setVariant('mario', 2);
    expect(eng.getVariant('mario')).toBe(2);
    eng.setVariant('mario', 9); // out of range -> ignored
    expect(eng.getVariant('mario')).toBe(2);
    eng.setVariant('nope', 1); // unknown game -> ignored
    expect(() => eng.setVariant('mario', 1)).not.toThrow();
  });
});

describe('AMBIENT room loop', () => {
  it('has 24 hourly variants + sleep heartbeat, all soft, uniform 16-step arrays', () => {
    expect(AMBIENT).toHaveLength(25); // 24 hours + sleep
    const checkMelody = (h) => h !== 24; // SLEEP MODE is intentionally silent
    for (let h = 0; h < 25; h++) {
      const t = AMBIENT[h];
      expect(t.soft, `${h} soft`).toBe(true);
      if (h < 24) expect(t.name, `${h} name`).toContain(`${String(h).padStart(2, '0')}:00`);
      if (h === 24) expect(t.name).toBe('SLEEP MODE');
      expect(t.lead.length).toBe(16);
      expect(t.bass.length).toBe(16);
      expect(t.hat.length).toBe(16);
      if (checkMelody(h)) expect(t.lead.some((v) => v > 0), `${h} has melody`).toBe(true);
      for (const lane of ['lead', 'bass', 'hat']) {
        for (const v of t[lane]) expect(typeof v).toBe('number');
      }
      for (const v of t.hat) expect([0, 1]).toContain(v);
    }
  });

  it('hours actually differ (transposition + bpm cycle)', () => {
    expect(AMBIENT[0].lead).not.toEqual(AMBIENT[1].lead);
    expect(AMBIENT[0].bpm).not.toBe(AMBIENT[4].bpm); // bpm cycle varies
    // adjacent hours within the same mood share a mood (night 0-4) but differ
    expect(new Set(AMBIENT.slice(0, 5).map((t) => t.lead.join(','))).size).toBeGreaterThan(1);
  });

  it('engine startAmbient is a safe no-op without WebAudio', () => {
    const eng = new AudioEngine();
    expect(() => eng.startAmbient()).not.toThrow();
    expect(eng.ambientTimer).toBeFalsy();
    expect(eng.getVariant('ambient')).toBe(0);
    eng.setVariant('ambient', 13);
    expect(eng.getVariant('ambient')).toBe(13);
    expect(() => eng.startAmbient()).not.toThrow();
  });
});