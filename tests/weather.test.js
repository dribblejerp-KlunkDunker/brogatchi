// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { AMBIENT, setWeatherMood, getWeatherMood } from '../src/ui/audio.js';

describe('weather mood override', () => {
  afterAll(() => { setWeatherMood(null); }); // unstain global state

  it('defaults to null (clock-based)', () => {
    setWeatherMood(null);
    expect(getWeatherMood()).toBeNull();
  });

  it('setting a mood rebuilds ambient and changes names', () => {
    const namesBefore = AMBIENT.map((t) => t.name);
    setWeatherMood('night');
    const namesNight = AMBIENT.map((t) => t.name);
    expect(namesNight).not.toEqual(namesBefore);
    // All 24 hourly slots (not the sleep track at index 24) read NIGHT FM
    expect(namesNight.slice(0, 24).every((n) => n.includes('NIGHT FM'))).toBe(true);
    expect(namesNight[24]).toBe('SLEEP MODE');
  });

  it('return value reports whether mood actually changed', () => {
    setWeatherMood(null); // reset
    expect(setWeatherMood('day')).toBe(true);
    expect(setWeatherMood('day')).toBe(false); // no-op, same mood
    expect(setWeatherMood('night')).toBe(true);
    expect(setWeatherMood(null)).toBe(true);
    expect(setWeatherMood(null)).toBe(false); // already null
  });

  it('rebuild keeps the array length and soft flag', () => {
    setWeatherMood('dawn');
    expect(AMBIENT).toHaveLength(25); // 24 hours + sleep
    for (const t of AMBIENT) {
      expect(t.soft).toBe(true);
      expect(t.lead.length).toBe(16);
      expect(t.bass.length).toBe(16);
      expect(t.hat.length).toBe(16);
    }
  });

  it('every supported mood produces non-silent lead lines', () => {
    for (const mood of ['night', 'dawn', 'day', 'dusk']) {
      setWeatherMood(mood);
      for (let i = 0; i < 24; i++) { // skip the sleep track
        const t = AMBIENT[i];
        expect(t.lead.some((v) => v > 0), `${mood} h${i} has notes`).toBe(true);
      }
    }
  });

  it('setting null restores clock-based hour-varied moods', () => {
    setWeatherMood(null);
    const names = AMBIENT.map((t) => t.name);
    const labels = new Set(names);
    // With clock-based moods there are 4 labels across the 24 hours
    expect(labels.size).toBeGreaterThanOrEqual(4);
  });
});

// Verify the name has a reasonable shape for the HUD
describe('ambient naming', () => {
  it('every hourly variant name includes an hour and a label', () => {
    for (let i = 0; i < 24; i++) {
      expect(AMBIENT[i].name).toMatch(/^\d{2}:00 /);
    }
    expect(AMBIENT[24].name).toBe('SLEEP MODE');
  });
});