// @vitest-environment jsdom
// Boots the real app against the real index.html DOM and drives a few
// workflows. Catches wiring bugs the unit tests can't.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

// jsdom has no canvas — stub it to a no-op so GameBase can start.
beforeAll(() => {
  document.documentElement.innerHTML = html;
  HTMLCanvasElement.prototype.getContext = () =>
    new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === 'measureText') return () => ({ width: 10 });
          if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
          return typeof prop === 'string' && /^fill|stroke|begin|arc|rect|save|restore|clear|translate|scale|rotate|lineTo|moveTo|ellipse|textBaseline|textAlign$/.test(prop)
            ? () => {}
            : undefined;
        },
      }
    );
});

describe('BroGatchiApp integration', () => {
  it('boots, feeds, opens modals, and runs a game', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();

    // boot
    expect(app.state).toBeTruthy();
    expect(document.getElementById('coin-count').innerText).toBe('50');
    expect(app.state.level).toBe(1);

    // pet interaction bumps happiness
    const happyBefore = app.state.stats.happy;
    app.interactWithPet();
    expect(app.state.stats.happy).toBeGreaterThan(happyBefore);

    // feed
    const coinsBefore = app.state.coins;
    app.feed('salad');
    expect(app.state.stats.hunger).toBe(90); // 75 + 15
    app.feed('pizza');
    expect(app.state.coins).toBe(coinsBefore - 5);

    // wardrobe renders
    app.openWardrobe();
    expect(document.querySelectorAll('.gear-btn').length).toBeGreaterThan(10);
    app.buyGear('hat', 'cap');
    expect(app.state.inventory.hat).toBe('cap');
    app.closeModals();

    // tasks
    app.openTaskMenu();
    document.getElementById('irl-input').value = 'Test quest';
    app.addIrlTask();
    expect(app.state.irlTasks).toContain('Test quest');
    app.completeIrl(0);
    app.closeModals();

    // journal: baseline entry with a screenshot, level-up milestone, modal render
    expect(app.state.journal.length).toBe(1);
    expect(app.state.journal[0].type).toBe('spawn');
    expect(app.state.journal[0].svg).toContain('<rect');
    app.gainXp(60); // -> level 2 + title
    expect(app.state.journal.length).toBeGreaterThanOrEqual(3);
    expect(app.state.journal[app.state.journal.length - 1].type).toBe('title');
    app.openJournal();
    expect(document.getElementById('j-timeline').children.length).toBeGreaterThan(0);
    expect(document.getElementById('j-header').innerHTML).toContain('→');
    expect(document.getElementById('j-personality').innerHTML).toContain('polyline');
    app.closeModals();

    // diary
    app.openDiary();
    app.closeModals();

    // mini-game starter and plays a frame
    app.startMiniGame('breaker');
    expect(app.gameActive).toBe(true);
    expect(app.currentGame).toBeTruthy();
    app.currentGame.update(1 / 60);
    app.currentGame.render?.();

    // volume panel: toggles open, steppers adjust values + labels
    expect(document.getElementById('vol-settings').classList.contains('hidden')).toBe(true);
    app.toggleVolPanel();
    expect(document.getElementById('vol-settings').classList.contains('hidden')).toBe(false);
    const musicBefore = app.audio.musicVol;
    app.volStep('music', -1);
    expect(app.audio.musicVol).toBeCloseTo(Math.max(0, musicBefore - 0.1));
    expect(document.getElementById('vol-music').textContent).toBe(String(Math.round(app.audio.musicVol * 100)));
    app.volStep('sfx', 1); // already at max -> clamps and stays 1
    expect(app.audio.sfxVol).toBe(1);
    expect(document.getElementById('vol-sfx').textContent).toBe('100');
    app.toggleVolPanel();
    expect(document.getElementById('vol-settings').classList.contains('hidden')).toBe(true);
    app.closeMiniGame();
    expect(app.gameActive).toBe(false);

    // rpg boots
    app.startMiniGame('rpg');
    expect(app.currentGame.phase).toBe('story');
    app.currentGame.onPointer(200, 400);
    app.currentGame.onPointer(200, 400);
    app.currentGame.onPointer(200, 400);
    expect(app.currentGame.phase).toBe('combat');
    app.currentGame.update(1 / 60);
    app.closeMiniGame();

    // persistence
    app.state.coins = 77;
    app.save();
    const { loadState } = await import('../src/core/save.js');
    expect(loadState().state.coins).toBe(77);
  });

  it('games switch music variants on milestones', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();

    // Fake a WebAudio context so the music slot actually engages (jsdom has none)
    const gain = () => ({ value: 0, cancelScheduledValues() {}, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    app.audio.ctx = {
      state: 'running',
      currentTime: 0,
      sampleRate: 44100,
      createGain: () => ({ gain: gain(), connect() {} }),
      createOscillator: () => ({ type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }),
      createBuffer: () => ({ getChannelData: () => new Float32Array(8) }),
      createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
      createBiquadFilter: () => ({ type: '', frequency: { value: 0 }, connect() {} }),
    };

    // RPG: story -> combat -> variant 1; enemy phase2 -> variant 2
    app.startMiniGame('rpg');
    expect(app.audio.getVariant('rpg')).toBe(0);
    app.currentGame.onPointer(200, 400);
    app.currentGame.onPointer(200, 400);
    app.currentGame.onPointer(200, 400);
    expect(app.currentGame.phase).toBe('combat');
    expect(app.audio.getVariant('rpg')).toBe(1);
    const agent = app.currentGame.enemies[1];
    agent.hp = agent.maxHp * 0.4; // below half -> phase 2
    app.currentGame.damage(agent, app.currentGame.heroes[0], 0.01, 'ATK');
    expect(agent.phase2).toBe(true);
    expect(app.audio.getVariant('rpg')).toBe(2);
    app.closeMiniGame();

    // Breaker: reaching level 3+ -> variant 1, 5+ -> variant 2
    app.startMiniGame('breaker');
    expect(app.audio.getVariant('breaker')).toBe(0);
    app.currentGame.level = 3;
    app.currentGame.loadLevel();
    expect(app.audio.getVariant('breaker')).toBe(1);
    app.currentGame.level = 5;
    app.currentGame.loadLevel();
    expect(app.audio.getVariant('breaker')).toBe(2);
    app.closeMiniGame();

    // Mario: crossing the checkpoint -> variant 1
    app.startMiniGame('mario');
    expect(app.audio.getVariant('mario')).toBe(0);
    app.currentGame.player.x = 1600;
    app.currentGame.checkpointReached = false;
    app.currentGame.update(1 / 60);
    expect(app.currentGame.checkpointReached).toBe(true);
    expect(app.audio.getVariant('mario')).toBe(1);
    app.closeMiniGame();

    // leaving the arcade returns to the quiet ambient room loop
    expect(app.audio.music && app.audio.music.id).toBe('ambient');
    expect(app.audio.music.track.soft).toBe(true);

    // unmuting from the room starts ambient again
    app.audio.stopMusic();
    app.toggleMusic(); // on -> off
    expect(app.audio.music).toBeFalsy();
    app.toggleMusic(); // off -> on; no game active
    expect(app.audio.music && app.audio.music.id).toBe('ambient');
  });

  it('composer opens, renders the grid, and edits a note live', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();

    expect(document.getElementById('modal-composer').style.display).toBe('none');
    app.toggleComposer();
    const modal = document.getElementById('modal-composer');
    expect(modal.style.display).toBe('flex');

    // grid built: 3 lane rows x 16 cells
    const cells = modal.querySelectorAll('.comp-cell');
    expect(cells.length).toBe(48);
    // chips populated
    expect(document.querySelectorAll('#comp-tracks [data-id]').length).toBe(4);
    expect(modal.querySelectorAll('#comp-chips button').length).toBeGreaterThan(3);

    // live edit: click a lead cell (col 4 of the flappy lead row) -> midi 60 -> display C4
    const leadCells = modal.querySelectorAll('.comp-cell[data-lane="lead"]');
    leadCells[4].click();
    const midi = document.getElementById('comp-midi');
    midi.value = '60';
    midi.dispatchEvent(new Event('change'));
    expect(leadCells[4].textContent).toBe('C4');

    // hat toggle on/off
    const hatCells = modal.querySelectorAll('.comp-cell[data-lane="hat"]');
    hatCells[0].click();
    expect(hatCells[0].textContent).toBe('X');
    hatCells[0].click();
    expect(hatCells[0].textContent).toBe('');

    // reset restores
    document.getElementById('comp-reset').click();
    expect(leadCells[4].textContent).not.toBe('C4');

    app.toggleComposer();
    expect(modal.style.display).toBe('none');
  });

  it('weather polling rebuilds ambient mood and says a line', async () => {
    const origFetch = global.fetch;
    global.fetch = async (url) => ({
      ok: true,
      json: async () => ({ mood: 'night', condition: 'heavy rain', temp: 9 }),
    });

    const { BroGatchiApp } = await import('../src/ui/app.js');
    const { getWeatherMood } = await import('../src/ui/audio.js');
    const app = new BroGatchiApp();

    // force the pending poll
    await app._pollWeather();
    global.fetch = origFetch;

    expect(getWeatherMood()).toBe('night');

    // storm condition fires a storm line (overwrites mood line)
    const el = document.getElementById('dialogue-text');
    expect(el).toBeTruthy();
    expect(el.innerHTML.length).toBeGreaterThan(10);
    // line should be storm-themed — no placeholder left behind
    expect(el.innerHTML).not.toContain('{condition}');
    expect(el.innerHTML).not.toContain('{temp}');

    // badge appears
    const badge = document.getElementById('weather-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toMatch(/\uD83C[\uDF27\uDF26]/);
    expect(badge.textContent).toContain('9°');
    expect(badge.title).toBe('heavy rain');

    // weather mood change logged a journal entry with snapshot
    const weatherEntries = app.state.journal.filter((e) => e.type === 'weather');
    expect(weatherEntries.length).toBe(1);
    const we = weatherEntries[0];
    expect(we.label).toContain('moody');
    expect(we.note).toContain('9°C');
    expect(we.svg).toContain('<rect'); // SVG snapshot captured    // ambient caption now includes the weather condition (after fade delay)
    const caption = document.getElementById('ambient-caption');
    await new Promise((r) => setTimeout(r, 300));
    expect(caption.textContent).toContain('rain');

    // second poll with same condition should NOT re-fire storm line
    const beforeSecond = el.innerHTML;
    global.fetch = async (url) => ({
      ok: true,
      json: async () => ({ mood: 'night', condition: 'heavy rain', temp: 9 }),
    });
    await app._pollWeather();
    // dialogue should be unchanged (storm line guard suppressed duplicate)
    expect(el.innerHTML).toBe(beforeSecond);
    global.fetch = origFetch;

    // clean up module-level state
    const { setWeatherMood } = await import('../src/ui/audio.js');
    setWeatherMood(null);
  });

  it('city fallback: readWeatherCity degrades gracefully without localStorage', async () => {
    const { readWeatherCity } = await import('../src/ai/client.js');
    expect(readWeatherCity()).toBe('');
  });
});