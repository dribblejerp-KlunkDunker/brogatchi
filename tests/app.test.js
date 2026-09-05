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
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
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

    // greed meter in the HUD mirrors the personality trait live
    const greedBar = document.getElementById('bar-greed');
    expect(greedBar).toBeTruthy();
    expect(greedBar.style.width).toBe('10%'); // default greed = 10
    app.state.personality.greed = 42;
    app.updateUI();
    expect(greedBar.style.width).toBe('42%');

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

    // loot boots, catches a coin, takes a bomb hit
    app.startMiniGame('loot');
    expect(app.gameActive).toBe(true);
    const g = app.currentGame;
    expect(g.key).toBe('loot');
    g.update(1 / 60);
    g.onPointer(300); // pointer-follow input
    g.items.push({ x: g.px, y: 515, vy: 300, bomb: false, w: 24, h: 22 });
    g.update(1 / 60);
    g.update(1 / 60);
    expect(g.score).toBeGreaterThan(0);
    g.items.push({ x: g.px, y: 515, vy: 300, bomb: true, w: 28, h: 28 });
    g.update(1 / 60);
    g.update(1 / 60);
    expect(g.lives).toBe(2);
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
    // chips populated (5 game tracks: flappy, breaker, mario, rpg, loot)
    expect(document.querySelectorAll('#comp-tracks [data-id]').length).toBe(5);
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

  it('renderRyan keeps Ryan visible: layout classes survive and idle classes layer on', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();
    const svg = document.getElementById('ryan-svg');
    expect(svg).toBeTruthy();

    // Layout classes from index.html must survive rendering (regression: a
    // setAttribute('class', ...) used to wipe them, hiding Ryan entirely).
    for (const cls of ['w-40', 'h-auto', 'drop-shadow-xl', 'z-10', 'pixelated', 'anim-idle']) {
      expect(svg.classList.contains(cls), `svg missing ${cls}`).toBe(true);
    }

    // Personality idle classes layer on top WITHOUT wiping the layout classes.
    app.state.personality.paranoia = 70;
    app.state.stats.energy = 20; // also triggers idle-slouch
    app.renderRyan();
    expect(svg.classList.contains('idle-shifty')).toBe(true);
    expect(svg.classList.contains('idle-slouch')).toBe(true);
    for (const cls of ['w-40', 'h-auto', 'drop-shadow-xl', 'z-10', 'pixelated']) {
      expect(svg.classList.contains(cls), `svg lost ${cls}`).toBe(true);
    }
  });

  // NOTE: jsdom cannot evaluate inline onclick="app.*" attributes (the global
  // `app` is never visible to them in this environment), so these tests assert
  // the HTML wiring by attribute + drive the app methods directly.
  it('the feed button opens the food menu', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();
    const btn = document.querySelector('[aria-label="Open food menu"]');
    expect(btn.getAttribute('onclick')).toBe('app.openFoodMenu()');
    app.openFoodMenu();
    expect(document.getElementById('modal-food').style.display).toBe('flex');
    app.closeModals();
  });

  it('petting and feeding Zeke do not also pet Ryan', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();
    // ensure a clean companion state regardless of earlier saves
    app.state.sideBro = null;
    app.state.coins = 100;
    app.state.counters.pet = 5;
    app.spawnSideBro();
    expect(app.state.sideBro).toBeTruthy();
    // the room UI wires these companion actions to Zeke, not Ryan
    const petZeke = document.querySelector('[aria-label="Pet Zeke"]');
    expect(petZeke.getAttribute('onclick')).toBe('event.stopPropagation(); app.petSideBro()');
    const feedZeke = document.querySelector('[aria-label="Feed Zeke"]');
    expect(feedZeke.getAttribute('onclick')).toBe('event.stopPropagation(); app.feedSideBro()');

    const petsBefore = app.state.counters.pet;
    const zekePetsBefore = app.state.sideBro.pet;
    app.petSideBro();
    expect(app.state.sideBro.pet).toBe(zekePetsBefore + 1); // Zeke got petted
    expect(app.state.counters.pet).toBe(petsBefore); // Ryan did NOT

    const hungerBefore = app.state.sideBro.hunger;
    app.feedSideBro();
    expect(app.state.sideBro.hunger).toBeGreaterThan(hungerBefore); // Zeke fed
    expect(app.state.counters.pet).toBe(petsBefore); // still no Ryan pet
  });

  it('spawning Zeke never pets Ryan', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();
    const spawnBtn = document.getElementById('spawn-side-bro-btn');
    expect(spawnBtn.getAttribute('onclick')).toBe('event.stopPropagation(); app.spawnSideBro()');
    // start with no companion (earlier tests may have saved one)
    app.state.sideBro = null;
    app.state.coins = 10;
    app.state.counters.pet = 0;

    app.spawnSideBro(); // too poor -> rejected
    expect(app.state.sideBro).toBeFalsy();
    expect(app.state.counters.pet).toBe(0); // spawn did NOT pet Ryan

    app.state.coins = 100;
    app.spawnSideBro(); // success
    expect(app.state.sideBro).toBeTruthy();
    expect(app.state.counters.pet).toBe(0); // still no Ryan pet
  });

  it('pins milestone memories so the cap cannot churn them out; user pin toggle persists', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();

    // a milestone memory arrives pinned (IRL quest completion)
    app.completeIrl(0);
    expect(app.state.memories.length).toBeGreaterThan(0);
    expect(app.state.memories.some((m) => m.pinned && m.text.includes('real-life quest'))).toBe(true);

    // importance-5 noise cannot evict it, even past the cap
    for (let i = 0; i < 30; i++) app.memory(`noise flood ${i}`, '🪙', 5);
    const pinned = app.state.memories.filter((m) => m.pinned);
    expect(pinned.length).toBeGreaterThanOrEqual(1);
    expect(pinned.some((m) => m.text.includes('real-life quest'))).toBe(true);

    // the pin toggle works end to end (pin, then unpin restores)
    const casual = app.state.memories.find((m) => !m.pinned);
    app.pinMemory(casual.id);
    expect(app.state.memories.find((m) => m.id === casual.id).pinned).toBe(true);
    app.pinMemory(casual.id);
    expect(app.state.memories.find((m) => m.id === casual.id).pinned).toBe(false);

    // normalize (what a reload runs) preserves exactly the pinned milestones
    const { normalize } = await import('../src/core/save.js');
    const kept = normalize({ memories: app.state.memories });
    expect(kept.memories.filter((m) => m.pinned).map((m) => m.id).sort())
      .toEqual(pinned.map((m) => m.id).sort());
  });

  it('the Ask modal shows a live Tide budget readout (used/cap today)', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();
    const note = document.getElementById('ask-api-note');
    expect(note).toBeTruthy();

    app.aiLinkText = '\uD83D\uDFE2 AI LINK: ONLINE (web search armed)';
    app.state.aiBudget = { day: new Date().toLocaleDateString(), used: 12, cap: 40, rateLimitedUntil: 0 };
    app.updateUI();
    expect(note.innerText).toContain('12/40');

    // rationed out for the day -> explicit hint
    app.state.aiBudget.used = 40;
    app.updateUI();
    expect(note.innerText).toContain('rationed out for today');

    // yesterday's usage reads as 0 until the first spend of the new day
    app.state.aiBudget = { day: '9/3/2026', used: 39, cap: 40, rateLimitedUntil: 0 };
    app.updateUI();
    expect(note.innerText).toContain('0/40');

    // rate-limited -> quiet hint
    app.state.aiBudget = { day: new Date().toLocaleDateString(), used: 5, cap: 40, rateLimitedUntil: Date.now() + 60_000 };
    app.updateUI();
    expect(note.innerText).toContain('gone quiet');
  });

  it('persists Ask exchanges to the durable log and browses them via the LOG toggle', async () => {
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const app = new BroGatchiApp();
    // Seed the transcript directly (the gateway call itself is covered elsewhere).
    app.state.askLog = [
      { q: 'favorite shell?', a: 'A **clean install** is a lie.', at: Date.now(), offline: true },
      { q: 'is the tide real?', a: 'The **Tide** provides.', at: Date.now() - 1000, offline: false },
    ];
    app.openAskModal();
    // Live view by default; the log is hidden.
    expect(document.getElementById('ask-log-view').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('ask-response').classList.contains('hidden')).toBe(false);
    // Toggle to the log: newest first, markdown rendered, offline flag shown.
    app.toggleAskLog();
    const view = document.getElementById('ask-log-view');
    expect(view.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('ask-response').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('ask-input').classList.contains('hidden')).toBe(true);
    expect(view.textContent).toContain('is the tide real?');
    expect(view.textContent).toContain('favorite shell?');
    expect(view.innerHTML).toContain('<strong>Tide</strong>'); // markdown rendered
    expect(view.textContent).toContain('offline');
    expect(view.firstElementChild.textContent).toContain('favorite shell?'); // newest first
    // Toggle back to the live answer box.
    app.toggleAskLog();
    expect(view.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('ask-input').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('ask-log-btn').textContent).toBe('📜 LOG');
  });
});