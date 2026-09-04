// Bro OS orchestrator. Keeps the original public method names that the HTML
// onclick handlers rely on (app.*), but delegates into the modular systems.

import { AudioEngine, setWeatherMood } from './audio.js';
import * as hud from './hud.js';
import * as modals from './modals.js';
import * as inventory from './inventory.js';
import * as intel from './intel.js';
import * as jooh from './jooh.js';
import * as moltbook from './moltbook.js';
import { renderJournal } from './journal.js';
import * as composer from './composer.js';
import { renderMarkdown } from './markdown.js';

import { tick as statsTick, applyOffline, FOODS, weightTier, TIER_NAMES } from '../core/stats.js';
import { entryFromState, addEntry as journalAdd } from '../core/journal.js';
import { loadState, saveState, rolloverIfNeeded, todayKey } from '../core/save.js';
import * as personality from '../core/personality.js';
import * as evolution from '../core/evolution.js';
import { buildSpec, HATS, SHIRTS, GLASSES, CHAINS, BACKPACKS, PANTS, SHOES, WRISTS, personalityIdleClasses } from '../core/ryanSpec.js';
import { renderRyanSVG } from './ryanView.js';

import { apiHealth, chat, fetchWeather, readWeatherCity } from '../ai/client.js';
import { buildStateReport } from '../ai/context.js';
import { buildRyanSystemPrompt } from '../ai/prompt.js';
import { pickLine, generatedTheory, deepDiveQuestion, pickStormLine, isStormCondition } from '../ai/offline.js';
import { initNotifications, requestPermission, scheduleHungerNudge, scheduleSleepNudge, scheduleQuestReminder } from '../core/notify.js';
import { readSyncCode, writeSyncCode, pullSync, pushSync, mergeRemote } from '../core/sync.js';
import { hasSecondBro, spawnSecondBro, tickSideBro, feedSideBro, petSideBro, sideBroLine } from '../core/secondBro.js';

import { FlappyGame } from '../games/flappy.js';
import { BreakerGame } from '../games/breaker.js';
import { MarioGame } from '../games/mario.js';
import { RPGGame } from '../games/rpg.js';
import { LootGame } from '../games/loot.js';

export class BroGatchiApp {
  constructor() {
    this.audio = new AudioEngine();
    composer.attach(this.audio);
    this.state = loadState().state;

    // GUI flags
    this.sleeping = false;
    this.chewing = false;
    this.pedometerActive = false;
    this.lastStepTime = 0;
    this.aiKeyPresent = false;
    this.aiChecked = false;

    this.chatHistory = [];
    this.gameActive = false;
    this.currentGame = null;
    this._minuteCounter = 0;
    this._lastTier = weightTier(this.state.stats.weight);
    this._stepsMilestone = this.state.steps >= 5000;

    this.init();
    this._bindComposerHotkey();
    this._armAmbient();
  }

  // Browsers block audio before the first gesture; once the user interacts,
  // start the quiet room loop (and keep re-trying on later taps harmlessly).
  _armAmbient() {
    const tryStart = () => {
      if (this.gameActive || this.currentGame) return; // don't override a running game's track
      if (this.audio.musicEnabled) {
        this.audio.startAmbient((h) => this._onAmbientHour(h));
        // if Ryan was already sleeping from a previous session, switch to heartbeat
        if (this.sleeping) {
          this.audio.setSleeping(true);
          hud.updateAmbientCaption('SLEEP MODE');
        } else {
          this._updateAmbientCaption();
        }
      }
    };
    window.addEventListener('pointerdown', tryStart, { passive: true });
    window.addEventListener('keydown', tryStart);
  }

  _onAmbientHour(h) {
    this._updateAmbientCaption();
  }

  _updateAmbientCaption() {
    const name = this.audio.getAmbientName();
    const tag = this._buildWeatherTag();
    const full = name + tag;
    if (full) hud.updateAmbientCaption(full);
  }

  _buildWeatherTag() {
    if (!this._lastWeather || !this._lastWeather.condition) return '';
    const c = this._lastWeather.condition;
    if (c.includes('clear') || c.includes('mostly clear')) return ' \u00B7 \u2600\uFE0F clear';
    if (c.includes('partly cloudy')) return ' \u00B7 \u26C5 partly cloudy';
    if (c.includes('overcast')) return ' \u00B7 \u2601\uFE0F overcast';
    if (c.includes('fog')) return ' \u00B7 \uD83C\uDF2B\uFE0F fog';
    if (c.includes('drizzle') || c.includes('shower')) return ' \u00B7 \uD83C\uDF26\uFE0F ' + c;
    if (c.includes('rain')) return ' \u00B7 \uD83C\uDF27 ' + c;
    if (c.includes('snow')) return ' \u00B7 \uD83C\uDF28 ' + c;
    if (c.includes('thunder')) return ' \u00B7 \u26C8\uFE0F ' + c;
    return ' \u00B7 ' + c;
  }

  _previewAmbient() {
    if (this.gameActive || this.currentGame) return; // don't interrupt a game
    if (this.audio.previewAmbient()) this.say("Previewing this hour's loop. Three bars, on the house.");
  }

  // ---------------------------------------------------------- weather
  setWeatherCity() {
    const current = readWeatherCity();
    const next = window.prompt('Fallback city for weather (blank to clear):', current);
    if (next === null) return; // cancelled
    try {
      window.localStorage.setItem('brogatchi_weather_city', next.trim());
      this.say(next.trim() ? `Weather fallback set to ${next.trim()}. Re-polling...` : 'Weather fallback cleared.');
      this._pollWeather();
    } catch { /* private mode */ }
  }

  async _pollWeather() {
    // Avoid stacking requests if one is already in flight.
    if (this._weatherPolling) return;
    this._weatherPolling = true;
    try {
      const data = await fetchWeather();
      this._weatherPolling = false;
      if (!data || !data.mood) {
        hud.updateWeatherBadge(null);
        this._weatherTag = '';
        this._updateAmbientCaption();
        return;
      }
      this._lastWeather = { condition: data.condition, temp: data.temp };
      hud.updateWeatherBadge(this._lastWeather);
      this._updateAmbientCaption(); // show condition in caption
      const changed = setWeatherMood(data.mood);
      const moods = { night: '\uD83C\uDF19 moody', dawn: '\uD83C\uDF05 hazy', day: '\u2600\uFE0F bright', dusk: '\uD83C\uDF06 warm' };
      if (changed) {
        const label = moods[data.mood] || data.mood;
        const temp = data.temp != null ? ` \u00B7 ${Math.round(data.temp)}\u00B0C` : '';
        this.say(`${label} vibes outside${temp}. The room shifts.`);
        // Log the weather shift in the evolution journal with a snapshot.
        const cond = data.condition ? ` (${data.condition})` : '';
        const t = data.temp != null ? ` \u00B7 ${Math.round(data.temp)}\u00B0C` : '';
        this.milestone('weather', `${label}${cond}`, `The outside world shifted the room's mood${t}.`);
      }
      // Rain, drizzle, or thunder? Ryan has opinions.
      if (isStormCondition(data.condition) && !this._lastStormCondition) {
        const line = pickStormLine(this.state, data.condition, data.temp);
        if (line) this.say(line);
      }
      this._lastStormCondition = isStormCondition(data.condition);
    } catch {
      this._weatherPolling = false;
    }
  }

  toggleComposer() {
    composer.toggle();
  }

  _bindComposerHotkey() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
        e.preventDefault();
        composer.toggle();
      }
    });
  }

  // ---------------------------------------------------------- init
  init() {
    this.applyOfflineDecay();
    const events = rolloverIfNeeded(this.state);
    events.forEach((e) => this.onRollover(e));

    hud.updateClock();
    this.updateUI();
    this.applyTheme();
    this.renderRyan();

    // Baseline journal entry (has Ryan's screenshot from moment zero)
    if (!this.state.journal.length) {
      this.state.journal = journalAdd(this.state.journal, this.captureJournal('spawn', 'Bro OS online'));
      this.save();
    }

    setInterval(() => hud.updateClock(), 1000);

    // Double-click the clock to preview the current hour's ambient loop
    const clockEl = hud.$('clock-time');
    if (clockEl) clockEl.addEventListener('dblclick', () => this._previewAmbient(), { passive: true });
    setInterval(() => this.tickState(), 15000);
    setInterval(() => this.idleChatter(), 30000);
    setInterval(() => {
      if (this.state.inventory.miner && !this.sleeping) {
        this.state.coins++;
        this.updateUI();
      }
    }, 10000);
    setInterval(() => this.oneMinute(), 60000);

    // Weather: poll once after the page settles, then every 30 min.
    setTimeout(() => this._pollWeather(), 4000);
    setInterval(() => this._pollWeather(), 30 * 60_000);

    this.say(this.bootedNote || pickLine('boot', this.state));

    // Cloud sync: pull remote state on boot and merge.
    if (readSyncCode()) this._runSyncPull();

    // Notification permission flow (first interaction will prompt if needed)
    if (typeof Notification !== 'undefined') {
      initNotifications().then(() => {
        const armPerm = () => {
          requestPermission().then((ok) => {
            if (ok) {
              scheduleHungerNudge(this.state);
              scheduleQuestReminder();
            }
          });
          document.body.removeEventListener('pointerdown', armPerm);
        };
        if (Notification.permission === 'default') {
          document.body.addEventListener('pointerdown', armPerm, { once: true });
        } else {
          armPerm();
        }
      });
    }

    // Unlock audio on first real gesture
    document.body.addEventListener('pointerdown', () => this.audio.resume(), { once: true });

    // AI status badge
    apiHealth().then((h) => {
      this.matchedKey = !!h.hasKey;
      this.aiChecked = true;
      const note = hud.$('ask-api-note');
      if (note) {
        note.innerText = h.hasKey
          ? '\uD83D\uDFE2 AI LINK: ONLINE (web search armed)'
          : '\uD83D\uDD34 AI LINK: OFFLINE \u2014 set GEMINI_API_KEY in .env to go online';
      }
    });
  }

  say(text) {
    hud.setDialogue(text || '\u2026');
  }

  // ---------------------------------------------------------- persistence
  save() {
    saveState(this.state);
    // Push to cloud if sync code is set (fire-and-forget)
    if (readSyncCode()) this._runSyncPush();
  }

  // ---------- cloud sync
  setSyncCode() {
    const current = readSyncCode();
    const next = window.prompt('Enter sync code (4-8 chars, same on both devices):', current);
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed && !/^[a-zA-Z0-9]{4,8}$/.test(trimmed)) {
      this.say('Code must be 4-8 letters/numbers only.');
      return;
    }
    writeSyncCode(trimmed);
    if (trimmed) {
      this.say(`Sync code set. Pulling latest state from cloud...`);
      this._runSyncPull();
    } else {
      this.say('Sync code cleared. Cloud sync disabled.');
    }
  }

  async _runSyncPush() {
    if (this._syncing) return;
    this._syncing = true;
    try {
      await pushSync(this.state);
    } catch { /* non-blocking */ }
    this._syncing = false;
  }

  async _runSyncPull() {
    const result = await pullSync();
    if (!result.ok || !result.state) return;
    this.state = mergeRemote(this.state, result.state);
    saveState(this.state);
    this.updateUI();
    this.say('Cloud save loaded! Stats merged up.');
  }

  // Stats decay + miner income while you were away (mirrors v3 behavior).
  applyOfflineDecay() {
    const mins = (Date.now() - (this.state.lastSave || Date.now())) / 60000;
    if (mins <= 1) return;
    const r = applyOffline(this.state.stats, mins, { hasMiner: this.state.inventory.miner });
    this.state.stats = r.stats;
    if (r.coins > 0) this.state.coins += r.coins;
    if (mins > 60 && this.state.clutter.length < 5) {
      this.state.clutter.push({ x: 20 + Math.random() * 60, type: '\uD83E\uDD64' });
    }
    const mined = r.coins > 0 ? ` The rig mined ${r.coins}c while I was collecting myself.` : '';
    this.bootedNote = `I was offline for ${Math.max(1, Math.round(mins))} min. The sim decayed my stats.${mined}`;
    if (mins > 30) this.memory('Came back from a long AFK. The sim is relentless.', '\u23F3', 2);
    this.save();
  }

  // ---------------------------------------------------------- survival
  tickState() {
    const events = rolloverIfNeeded(this.state);
    events.forEach((e) => this.onRollover(e));

    const next = statsTick(this.state.stats, {
      sleeping: this.sleeping,
      poop: this.state.poop,
      clutterCount: this.state.clutter.length,
    });
    this.state.stats = next;

    if (this.state.stats.hunger < 20) {
      this.say("Bro... feed me before I turn into a loading screen.");
      if (typeof Notification !== 'undefined') scheduleHungerNudge(this.state);
    }
    if (this.state.stats.hunger < 30 && !this.sleeping) {
      if (typeof Notification !== 'undefined') scheduleSleepNudge(this.state, this.sleeping, this._lastWakeTime);
    }

    // Random mess generator
    if (this.state.stats.hunger > 60 && Math.random() < 0.1 && this.state.poop < 4) {
      this.state.poop++;
    }
    if (!this.sleeping && Math.random() < 0.15 && this.state.clutter.length < 5) {
      const items = ['\uD83E\uDD64', '\uD83C\uDF55', '\uD83E\uDDE6', '\uD83C\uDFAE'];
      this.state.clutter.push({
        x: 10 + Math.random() * 80,
        type: items[Math.floor(Math.random() * items.length)],
      });
    }

    // Side bro decays alongside Ryan
    if (this.state.sideBro) {
      tickSideBro(this.state, this.sleeping);
      if (Math.random() < 0.08) {
        const line = sideBroLine(this.state);
        if (line) this.say(line);
      }
    }

    this.updateUI();
    this.save();
  }

  oneMinute() {
    personality.minuteDrift(this.state.personality, this.state);
    this.state.steps = this.state.steps; // rollover handled in tick
    this.save();
  }

  // ---------------------------------------------------------- colors / bars
  updateUI() {
    hud.updateHud(this.state);
    hud.updateMiner(this.state);
    hud.renderClutter(this.state);
    this.renderRyan();
    this.updateSideBroUI();
  }

  updateSideBroUI() {
    const panel = hud.$('side-bro-panel');
    const btn = hud.$('spawn-side-bro-btn');
    if (this.state.sideBro) {
      if (panel) panel.style.display = 'flex';
      if (btn) btn.style.display = 'none';
      const food = hud.$('side-bro-food');
      if (food) food.style.width = `${this.state.sideBro.hunger}%`;
      const mood = hud.$('side-bro-mood');
      if (mood) mood.style.width = `${this.state.sideBro.happy}%`;
    } else {
      if (panel) panel.style.display = 'none';
      if (btn) btn.style.display = '';
    }
  }

  // ------------------------------------------------------------ Ryan view
  renderRyan() {
    const svg = hud.$('ryan-svg');
    if (!svg) return;
    const spec = buildSpec(this.state, { sleeping: this.sleeping, chewing: this.chewing });
    const pidle = personalityIdleClasses(this.state);
    const key = [
      spec.tier, spec.mood, spec.outfit.shirt.id, spec.outfit.hat.id,
      spec.outfit.pants ? spec.outfit.pants.id : 'n', spec.outfit.shoes ? spec.outfit.shoes.id : 'n',
      spec.outfit.glasses.id, spec.outfit.chain.id, spec.outfit.wrist ? spec.outfit.wrist.id : 'n',
      spec.outfit.backpack.id,
      this.state.forme || 'none', this.sleeping ? 1 : 0, this.chewing ? 1 : 0,
      this.state.moltbook?.eye || 'closed',
      pidle,
    ].join('|');
    if (key !== this.lastSpecKey) {
      this.lastSpecKey = key;
      svg.innerHTML = renderRyanSVG(spec);
    }

    // Apply personality idle animation classes to the SVG element.
    // NOTE: use classList, NOT setAttribute - setAttribute wipes layout classes
    // (w-40, h-auto, drop-shadow-xl) set in the HTML, making Ryan invisible.
    svg.classList.remove(
      'anim-idle', 'sleeping', 'chewing',
      'idle-shifty', 'idle-bounce', 'idle-flex', 'idle-chonk', 'idle-slouch', 'idle-greedy'
    );
    if (pidle) pidle.split(' ').filter(Boolean).forEach((c) => svg.classList.add(c));
    if (this.sleeping) svg.classList.add('sleeping');
    if (this.chewing) svg.classList.add('chewing');
    if (!this.sleeping && !this.chewing && !pidle) svg.classList.add('anim-idle');

    // hat slot
    const hat = hud.$('hat-slot');
    if (hat) {
      const glyph = inventory.hatGlyph(this.state);
      if (glyph) {
        hat.innerText = glyph;
        hat.style.display = 'block';
      } else {
        hat.style.display = 'none';
      }
    }

    // physique-change milestone (weight tiers crossing)
    if (this._lastTier && this._lastTier !== spec.tier) {
      this.milestone('tier', `${TIER_NAMES[this._lastTier]} \u2192 ${TIER_NAMES[spec.tier]}`, '');
    }
    this._lastTier = spec.tier;

    // physics label + forme aura
    const aura = hud.$('ryan-wrapper');
    if (aura) {
      aura.classList.remove('aura-shred', 'aura-chonk', 'aura-glitch');
      if (this.state.forme) aura.classList.add(`aura-${this.state.forme.toLowerCase()}`);
    }

    // Continuous weight stretch: scaleX interpolates from 0.82 (lean, weight 1.0)
    // to ~1.35 (chonk, weight 3.0+). CSS transition on #ryan-wrapper makes it
    // animate smoothly as weight drifts up/down between tier boundary SVG rebuilds.
    const w = Math.max(0.8, Math.min(this.state.stats.weight, 3.0));
    const scaleX = (0.75 + w * 0.2).toFixed(3);
    const wrapper = hud.$('ryan-wrapper');
    if (wrapper) {
      if (wrapper.dataset.bounce) {
        wrapper.style.transform = `translateY(-14px) scaleX(${scaleX})`;
      } else {
        wrapper.style.transform = `scaleX(${scaleX})`;
      }
    }
  }

  // ---------------------------------------------------------- evolution journal
  captureJournal(type, label, note = '') {
    const svg = hud.$('ryan-svg')?.innerHTML || '';
    return entryFromState(this.state, { type, label, note, svg });
  }

  milestone(type, label, note = '') {
    this.state.journal = journalAdd(this.state.journal, this.captureJournal(type, label, note));
    this.save();
  }

  openJournal() {
    this.audio.playBeep();
    modals.openModal('modal-journal');
    renderJournal(this.state);
  }

  petBounce() {
    const wrapper = hud.$('ryan-wrapper');
    if (!wrapper) return;
    const w = Math.max(0.8, Math.min(this.state.stats.weight, 3.0));
    const scaleX = (0.75 + w * 0.2).toFixed(3);
    wrapper.dataset.bounce = '1';
    wrapper.style.transform = `translateY(-14px) scaleX(${scaleX})`;
    setTimeout(() => {
      wrapper.style.transform = `scaleX(${scaleX})`;
      delete wrapper.dataset.bounce;
    }, 220);
  }

  // ---------------------------------------------------------- interactions
  interactWithPet() {
    this.audio.playBeep();
    if (this.sleeping) {
      this.say('Bro... let me sleep.');
      return;
    }
    this.state.stats.happy = Math.min(100, this.state.stats.happy + 2);
    this.state.stats.energy = Math.max(0, this.state.stats.energy - 1);
    this.state.counters.pet++;
    this.petBounce();
    this.gainXp(2);
    personality.applyEvents(this.state.personality, [{ trait: 'broCode', amount: 0.6 }]);

    if (this.state.stats.weight > 2.2) this.say('Bro... these pixels are tight.');
    else if (this.state.clutter.length > 2) this.say('Peak gamer setup in here.');
    else this.say(['Lag spike?', 'Skill issue.', 'Need more RGB.', 'Is the mic on?'][Math.floor(Math.random() * 4)]);
    this.updateUI();
  }

  openFoodMenu() {
    this.audio.playBeep();
    modals.openModal('modal-food');
  }

  feed(foodKey) {
    const food = FOODS[foodKey];
    if (!food) return;
    if (this.state.coins < food.cost) {
      this.audio.playHit();
      this.say('Not enough coins, grind more.');
      return;
    }
    if (this.state.stats.hunger >= 100 && !food.energy) {
      this.audio.playHit();
      this.say("Inventory full. Can't eat.");
      return;
    }

    this.state.coins -= food.cost;
    this.audio.playEat();
    this.chewing = true;
    this.renderRyan();
    setTimeout(() => {
      this.chewing = false;
      this.renderRyan();
    }, 500);

    if (food.energy) {
      this.state.stats.energy = Math.min(100, this.state.stats.energy + food.restore);
      this.state.counters.fuels++;
      personality.applyEvents(this.state.personality, [{ trait: 'ego', amount: 1.5 }]);
      this.say(pickLine('energyDrink', this.state));
    } else {
      this.state.stats.hunger = Math.min(100, this.state.stats.hunger + food.restore);
      this.state.stats.weight += food.weight;
      if (foodKey === 'pizza') { this.state.counters.pizzas++; personality.applyEvents(this.state.personality, [{ trait: 'gluttony', amount: 3 }]); }
      else if (foodKey === 'burger') { this.state.counters.burgers++; personality.applyEvents(this.state.personality, [{ trait: 'gluttony', amount: 4 }]); }
      else { this.state.counters.salads++; personality.applyEvents(this.state.personality, [{ trait: 'fitness', amount: 2 }]); }
      this.say(pickLine('fed', this.state));
    }
    this.gainXp(5);
    this.updateUI();
    this.save();
  }

  cleanHygiene() {
    const mess = this.state.poop + this.state.clutter.length;
    if (mess === 0) {
      this.audio.playHit();
      this.say('Spotless.');
      return;
    }
    this.audio.playTone(300, 'sawtooth', 0.2);
    setTimeout(() => this.audio.playTone(400, 'sawtooth', 0.2), 200);
    this.state.poop = 0;
    this.state.clutter = [];
    this.state.stats.happy = Math.min(100, this.state.stats.happy + mess * 5);
    personality.applyEvents(this.state.personality, [{ trait: 'broCode', amount: 2 }]);
    this.say(pickLine('clean', this.state));
    this.gainXp(5);
    this.updateUI();
    this.save();
  }

  toggleSleep() {
    this.audio.playBeep();
    this.sleeping = !this.sleeping;
    const scr = hud.$('game-screen');
    const zzz = hud.$('zzz-particles');
    const svg = hud.$('ryan-svg');
    if (this.sleeping) {
      scr.style.filter = 'brightness(0.5)';
      zzz.style.display = 'block';
      svg.classList.add('sleeping');
      svg.classList.remove('anim-idle');
      this.say(pickLine('sleepOn', this.state));
      this.audio.setSleeping(true);
      hud.updateAmbientCaption('SLEEP MODE');
      this._lastWakeTime = null;
    } else {
      scr.style.filter = 'none';
      zzz.style.display = 'none';
      svg.classList.remove('sleeping');
      svg.classList.add('anim-idle');
      this.say(pickLine('sleepOff', this.state));
      this.audio.setSleeping(false);
      this._updateAmbientCaption();
      this._lastWakeTime = Date.now();
    }
    this.renderRyan();
    this.save();
  }

  // ---------------------------------------------------------- pedometer
  togglePedometer() {
    this.audio.playBeep();
    if (this.pedometerActive) {
      window.removeEventListener('devicemotion', this.onMotion);
      this.pedometerActive = false;
      hud.setPedometerVisual(false);
      this.say(pickLine('pedOff', this.state));
      return;
    }
    const start = () => {
      this.onMotion = (e) => this.handleMotion(e);
      window.addEventListener('devicemotion', this.onMotion);
      this.pedometerActive = true;
      hud.setPedometerVisual(true);
      this.say(pickLine('pedOn', this.state));
    };
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then((perm) => (perm === 'granted' ? start() : this.say('Need sensor permission to track steps bro!')))
        .catch(() => this.say('Sensor error. Just manually log IRL quests instead!'));
    } else {
      start();
    }
  }

  handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;
    const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    if (mag > 14) {
      const now = Date.now();
      if (now - this.lastStepTime > 350) {
        this.lastStepTime = now;
        this.recordStep();
      }
    }
  }

  recordStep() {
    this.state.steps++;
    this.state.counters.steps++;
    if (this.state.steps > this.state.stepRecord) this.state.stepRecord = this.state.steps;
    if (this.state.steps % 10 === 0) {
      this.state.coins++;
      this.state.stats.weight = Math.max(1.0, this.state.stats.weight - 0.02);
      this.state.stats.happy = Math.min(100, this.state.stats.happy + 1);
      this.audio.playCoin();
      personality.applyEvents(this.state.personality, [{ trait: 'fitness', amount: 0.8 }]);
    }
    if (this.state.steps % 100 === 0) {
      this.memory(`Hit ${this.state.steps} steps today. Legs: calibrated.`, '\uD83D\uDC5F', 3);
    }
    if (this.state.steps >= 5000 && !this._stepsMilestone) {
      this._stepsMilestone = true;
      this.milestone('steps', '5,000 steps logged');
    }
    this.updateUI();
    this.save();
  }

  // ---------------------------------------------------------- stats & diary
  openStats() {
    this.audio.playBeep();
    modals.openModal('modal-stats');
    modals.renderStats(this.state);
  }

  openDiary() {
    this.audio.playBeep();
    modals.openModal('modal-diary');
    modals.renderDiary(this.state);
  }

  // ---------------------------------------------------------- wardrobe / shop
  openWardrobe() {
    this.audio.playBeep();
    modals.openModal('modal-shop');
    inventory.renderWardrobe(this.state);
    hud.$('shop-miner-cost').innerText = this.state.inventory.miner ? 'OWNED' : '100c';
  }

  buyGear(kind, id) {
    const map = {
      hat: [HATS, 'hat'],
      shirt: [SHIRTS, 'shirt'],
      pants: [PANTS, 'pants'],
      shoes: [SHOES, 'shoes'],
      glasses: [GLASSES, 'glasses'],
      chains: [CHAINS, 'chains'],
      wrist: [WRISTS, 'wrist'],
      backpacks: [BACKPACKS, 'backpacks'],
    };
    const cat = map[kind];
    if (!cat) return;
    const [items, slot] = cat;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    if (id === 'none') {
      this.state.inventory[slot] = 'none';
      if (slot === 'shirt') this.state.inventory.shirt = 'classic';
      if (slot === 'pants') this.state.inventory.pants = 'jeans';
      if (slot === 'shoes') this.state.inventory.shoes = 'sneakers';
      this.audio.playBeep();
      this.updateUI();
      this.save();
      inventory.renderWardrobe(this.state);
      return;
    }

    const owned =
      slot === 'shirt'
        ? this.state.inventory.shirts.includes(id)
        : ['pants','shoes','wrist'].includes(slot)
          ? this.state.inventory[slot] === undefined || this.state.inventory[slot] === id
          : this.state.inventory[slot] === id;
    if (!owned) {
      if (this.state.coins < item.price) {
        this.audio.playHit();
        this.say(`Need ${item.price}c, bro.`);
        return;
      }
      this.state.coins -= item.price;
      if (slot === 'shirt') this.state.inventory.shirts.push(id);
      this.audio.playCoin();
    }
    this.state.inventory[slot] = id;
    this.gainXp(2);
    if (item.price > 0) this.memory(`Bought the ${item.name}. Worth it.`, '\uD83D\uDECD\uFE0F', 2);
    this.say([`Fresh fit. ${item.name} acquired.`, `The drip matches the hits.`][this.state.memories.length % 2]);
    this.updateUI();
    this.save();
    inventory.renderWardrobe(this.state);
  }

  buyMiner() {
    if (this.state.inventory.miner) return;
    if (this.state.coins >= 100) {
      this.state.coins -= 100;
      this.state.inventory.miner = true;
      this.audio.playLevelUp();
      personality.applyEvents(this.state.personality, [{ trait: 'greed', amount: 3 }]);
      this.memory('Deployed the mining rig. Passive income go brrr.', '\u26CF\uFE0F', 3);
      this.milestone('rig', 'Mining rig online');
      this.say(pickLine('miner', this.state));
      this.updateUI();
      this.save();
    } else {
      this.audio.playHit();
      this.say('Need 100c bro.');
    }
  }

  setTheme(t) {
    this.state.inventory.theme = t;
    this.applyTheme();
    this.save();
  }

  applyTheme() {
    const scr = hud.$('game-screen');
    if (scr) scr.className = `p-3 pt-6 theme-${this.state.inventory.theme}`;
  }

  // ---------------------------------------------------------- tasks
  openTaskMenu() {
    this.audio.playBeep();
    modals.openModal('modal-tasks');
    this.renderTasks();
    modals.renderClaims(this.state);
  }

  renderTasks() {
    const list = hud.$('irl-list');
    if (!list) return;
    list.innerHTML = '';
    this.state.irlTasks.forEach((t, i) => {
      list.innerHTML += `
        <div class="flex justify-between items-center bg-gray-100 p-1 border border-black text-[8px]">
          <span>${t}</span>
          <button class="bg-blue-500 text-white px-2 py-1" onclick="app.completeIrl(${i})">Done</button>
        </div>`;
    });
  }

  completeTask(name, reward, cost) {
    if (this.state.stats.energy < cost) {
      this.audio.playHit();
      this.say('Too tired bro. Need fuel.');
      this.closeModals();
      return;
    }
    this.audio.playCoin();
    this.state.coins += reward;
    this.state.stats.energy -= cost;
    this.state.stats.weight = Math.max(1.0, this.state.stats.weight - 0.05);
    personality.applyEvents(this.state.personality, [{ trait: 'broCode', amount: 2 }, { trait: 'fitness', amount: 1 }]);
    this.say(`Quest complete: ${name}`);
    this.gainXp(15);
    this.updateUI();
    this.save();
    this.closeModals();
  }

  claimDaily(key) {
    const quest = modals.CLAIM_QUESTS.find((q) => q.key === key);
    if (!quest || this.state.claims[key] || !quest.ok(this.state)) {
      this.audio.playHit();
      return;
    }
    this.state.claims[key] = true;
    this.state.coins += quest.reward;
    this.audio.playCoin();
    if (quest.key === 'steps100') personality.applyEvents(this.state.personality, [{ trait: 'fitness', amount: 3 }]);
    if (quest.key === 'pet10') personality.applyEvents(this.state.personality, [{ trait: 'broCode', amount: 2 }]);
    personality.applyEvents(this.state.personality, [{ trait: 'greed', amount: 1 }]);
    this.say(`Daily claim banked: +${quest.reward} coins. The quest log says nice.`);
    this.gainXp(10);
    this.updateUI();
    this.save();
    modals.renderClaims(this.state);
  }

  addIrlTask() {
    const input = hud.$('irl-input');
    const val = input.value.trim();
    if (val) {
      this.audio.playBeep();
      this.state.irlTasks.push(val);
      input.value = '';
      this.renderTasks();
      this.save();
    }
  }

  completeIrl(idx) {
    this.state.irlTasks.splice(idx, 1);
    this.audio.playLevelUp();
    this.state.coins += 25;
    this.state.stats.happy = Math.min(100, this.state.stats.happy + 15);
    this.state.stats.weight = Math.max(1.0, this.state.stats.weight - 0.1);
    personality.applyEvents(this.state.personality, [{ trait: 'fitness', amount: 5 }, { trait: 'broCode', amount: 3 }]);
    this.memory('Finished a real-life quest. The sim shakes.', '\u2705', 4);
    this.say(pickLine('irlDone', this.state));
    this.gainXp(30);
    this.renderTasks();
    this.updateUI();
    this.save();
  }

  // ---------------------------------------------------------- ask / AI
  openAskModal() {
    this.audio.playBeep();
    modals.openModal('modal-ask');
  }

  async submitAsk(override) {
    const input = hud.$('ask-input');
    const res = hud.$('ask-response');
    const q = override || input.value.trim();
    if (!q) return;
    this.audio.playBeep();
    input.value = '';
    res.innerHTML = '<span class="animate-pulse text-blue-500">Bypassing CIA firewalls\u2026</span>';

    this.chatHistory.push({ role: 'user', parts: [{ text: q }] });
    if (this.chatHistory.length > 5) this.chatHistory.shift();

    const report = buildStateReport(this.state);
    const result = await chat({
      systemInstruction: buildRyanSystemPrompt(report),
      history: this.chatHistory,
    });

    if (result.ok) {
      this.chatHistory.push({ role: 'model', parts: [{ text: result.text }] });
      res.innerHTML = renderMarkdown(result.text) + (result.grounded === false
        ? '<div class="mt-2 border-t border-gray-300 pt-1 text-[7px] text-gray-400">\u26A1 no live web search on this key \u2014 answers from my firmware</div>'
        : '');
      // Ryan remembers his own answer, not just the question.
      const plain = result.text.replace(/[#*>`<\b]/g, '').trim().replace(/\s+/g, ' ');
      this.rememberOnce(`answered-${plain.slice(0, 40)}`, `Ryan answered: "${plain.slice(0, 60)}"`, '\uD83D\uDCDD', 2);
      this.state.coins += 5;
      this.state.stats.happy = Math.min(100, this.state.stats.happy + 10);
      personality.applyEvents(this.state.personality, [{ trait: 'paranoia', amount: 1 }]);
      this.gainXp(8);
      this.memory(`Asked Ryan: \"${q.slice(0, 40)}\"`, '\uD83E\uDDE0', 2);
      this.updateUI();
      this.save();
    } else {
      res.innerHTML = `<span class="text-purple-400 font-bold">[FIREWALL MODE]</span><br><span class="font-text">${generatedTheory(this.state)}</span>`;
    }
  }

  randomDeepDive() {
    const q = deepDiveQuestion();
    this.submitAsk(q);
  }

  // ---------------------------------------------------------- jooh
  openJoohTracker() {
    this.audio.playBeep();
    modals.openModal('modal-jooh');
    jooh.refreshJoohFeed(this.state);
    if (this.aiChecked && this.matchedKey) {
      jooh.appendAIIntercept(this.state, 'jooh-feed');
    }
  }

  hackJooh() {
    if (this.state.stats.energy < 5) {
      this.audio.playHit();
      this.say('Not enough energy to hack the mainframe bro!');
      return;
    }
    this.audio.playLevelUp();
    this.state.coins += 10;
    this.state.stats.energy -= 5;
    this.state.stats.happy = Math.min(100, this.state.stats.happy + 5);
    this.state.counters.hacks++;
    personality.applyEvents(this.state.personality, [{ trait: 'paranoia', amount: 5 }, { trait: 'ego', amount: 2 }, { trait: 'greed', amount: 3 }]);
    this.memory('Hacked the billionaire grid. They fear us.', '\uD83D\uDEF0\uFE0F', 3);
    jooh.refreshJoohFeed(this.state);
    this.say(pickLine('hack', this.state));
    this.gainXp(10);
    this.updateUI();
    this.save();
  }

  // ---------------------------------------------------------- intel
  toggleNewsPanel(e) {
    if (e) e.stopPropagation();
    this.audio.playBeep();
    const p = hud.$('panel-intel');
    p.classList.toggle('open');
    if (p.classList.contains('open')) intel.fetchNews(this);
  }

  fetchNews() { return intel.fetchNews(this); }
  sendIntelReply() { intel.sendReply(this); }

  // ---------------------------------------------------------- moltbook
  openMoltbook() {
    this.audio.playBeep();
    modals.openModal('modal-moltbook');
    moltbook.bindFeedEvents(this);
    moltbook.openMoltbook(this);
  }

  moltbookPost() {
    this.audio.playBeep();
    moltbook.postTheory(this);
  }

  moltbookUsher() {
    this.audio.playBeep();
    moltbook.usher(this);
  }

  moltbookOpenConv(convId) {
    this.audio.playBeep();
    moltbook.openConversationView(this, convId);
  }

  moltbookBack() {
    this.audio.playBeep();
    moltbook.backToFeed(this);
  }

  // ---------------------------------------------------------- leveling
  gainXp(amount) {
    const before = this.state.level;
    const events = evolution.addXp(this.state, amount);
    if (this.state.level !== before) {
      this.audio.playLevelUp();
      this.memory(`Hit level ${this.state.level}. The sim blinks.`, '\u2B06\uFE0F', 4);
    }
    events.forEach((e) => {
      if (e.type === 'levelup') this.milestone('level', `Level ${e.level}`);
      if (e.type === 'title') {
        this.say(`New title: ${e.title}. It fits.`);
        this.milestone('title', e.title);
      }
      if (e.type === 'forme') {
        this.say(pickLine('forme', this.state));
        this.memory(`Evolved into ${e.forme} forme. New aura unlocked.`, '\uD83C\uDF1F', 5);
        this.milestone('forme', `${e.forme} FORME`, 'The sim recalibrated to my aura.');
      }
    });
    this.updateUI();
    this.save();
  }

  memory(text, icon, imp) {
    this.state.memories.push({ icon, text, imp, day: todayKey() });
    this.state.memories.sort((a, b) => b.imp - a.imp);
    if (this.state.memories.length > 14) this.state.memories.length = 14;
    this.save();
  }

  // Like memory(), but skips duplicates of the same logical event (keyed).
  rememberOnce(key, text, icon, imp) {
    this._memoryKeys = this._memoryKeys || {};
    if (this._memoryKeys[key] === text) return false;
    this._memoryKeys[key] = text;
    this.memory(text, icon, imp);
    return true;
  }

  // ---------------------------------------------------------- rollover
  onRollover(e) {
    if (e && e.type === 'newday') {
      this.say(pickLine('newDay', this.state));
      this.memory(`New day. Yesterday: ${e.lines[0]}`, '\uD83D\uDCC5', 2);
      hud.setPedometerVisual(false);
    }
  }

  // ---------------------------------------------------------- idle chatter
  idleChatter() {
    if (this.sleeping) return;
    const s = this.state.stats;
    let line = null;
    if (s.hunger < 30) line = pickLine('hunger', this.state);
    else if (s.happy < 40) line = pickLine('happy', this.state);
    else if (s.energy < 20) line = pickLine('tired', this.state);
    else if (this.state.personality.greed > 60 && Math.random() < 0.5) line = pickLine('greedy', this.state);
    else if (Math.random() < 0.5) {
      const hour = new Date().getHours();
      const bank = hour < 11 ? 'morning' : hour < 18 ? 'midday' : hour < 23 ? 'evening' : 'night';
      line = pickLine(bank, this.state);
    }
    if (line) this.say(line);
  }

  // ---------------------------------------------------------- games
  startMiniGame(type) {
    this.closeModals();
    modals.openModal('modal-game');
    hud.$('game-over-screen').classList.add('hidden');

    const cvs = hud.$('game-canvas');
    cvs.width = 400;
    cvs.height = 600;

    this.gameActive = true;
    hud.$('game-score').innerText = 'SCORE: 0';
    hud.$('game-lives').innerText = '\u2764\uFE0F\u2764\uFE0F\u2764\uFE0F';

    const Games = { flappy: FlappyGame, breaker: BreakerGame, mario: MarioGame, rpg: RPGGame, loot: LootGame };
    this.currentGame = new Games[type](this, cvs);
    this.currentGame.start();

    // per-game chiptune loop
    this.audio.startMusic(type);
    this.syncMusicButton();
    this.syncVolButtons();
    hud.hideAmbientCaption();

    // wire input (converted to internal coords in GameBase)
    cvs.onpointerdown = cvs.ontouchstart = (e) => {
      if (e) e.preventDefault();
      const p = this._canvasPoint(e);
      if (p) this.currentGame.onPointer(p.x, p.y, e);
    };
    cvs.onpointermove = cvs.ontouchmove = (e) => {
      if (e && e.type === 'touchmove') e.preventDefault();
      const p = this._canvasPoint(e);
      if (p) this.currentGame.onPointerMove(p.x, p.y, e);
    };

    if (type === 'mario' || type === 'loot') {
      hud.$('virtual-gamepad').classList.remove('hidden');
    } else {
      hud.$('virtual-gamepad').classList.add('hidden');
    }
  }

  _canvasPoint(e) {
    const cvs = hud.$('game-canvas');
    const rect = cvs.getBoundingClientRect();
    let cx = e.clientX;
    let cy = e.clientY;
    if (e.touches && e.touches.length > 0) {
      cx = e.touches[0].clientX;
      cy = e.touches[0].clientY;
    }
    if (cx == null) return null;
    return {
      x: (cx - rect.left) * (cvs.width / rect.width),
      y: (cy - rect.top) * (cvs.height / rect.height),
    };
  }

  closeMiniGame() {
    if (this.currentGame) this.currentGame.stop();
    this.currentGame = null;
    this.gameActive = false;
    this.audio.stopMusic();
    hud.$('vol-settings')?.classList.add('hidden');
    modals.closeAll();
    hud.$('virtual-gamepad').classList.add('hidden');
    // back to the room: resume the ambient loop
    if (this.audio.musicEnabled) {
      this.audio.startAmbient((h) => this._onAmbientHour(h));
      this._updateAmbientCaption();
    }
  }

  toggleMusic() {
    const prev = this.audio.musicEnabled;
    this.audio.toggleMusic();
    this.syncMusicButton();
    if (!prev && this.audio.musicEnabled) {
      // unmuting should bring music back: the game loop, or the room ambience
      if (this.currentGame) this.audio.startMusic(this.currentGame.key);
      else {
        this.audio.startAmbient((h) => this._onAmbientHour(h));
        this._updateAmbientCaption();
      }
    }
  }

  syncMusicButton() {
    const btn = hud.$('btn-music');
    if (btn) btn.textContent = this.audio.musicEnabled ? '\u266A' : '\uD83D\uDD07';
  }

  toggleVolPanel() {
    const p = hud.$('vol-settings');
    if (!p) return;
    this.syncVolButtons();
    p.classList.toggle('hidden');
  }

  volStep(kind, dir) {
    const step = 0.1;
    if (kind === 'music') this.audio.setMusicVol(this.audio.musicVol + dir * step);
    else this.audio.setSfxVol(this.audio.sfxVol + dir * step);
    this.syncVolButtons();
    this.audio.playBeep();
  }

  syncVolButtons() {
    const m = hud.$('vol-music');
    if (m) m.textContent = Math.round(this.audio.musicVol * 100);
    const s = hud.$('vol-sfx');
    if (s) s.textContent = Math.round(this.audio.sfxVol * 100);
  }

  // Called by games when a run ends.
  onGameOver(gameKey, score, reward) {
    this.gameActive = false;
    if (this.currentGame) {
      this.currentGame.stop();
      this.currentGame = null;
    }
    this.audio.stopMusic();
    this.audio.playWin();
    const prevBest = this.state.bestScores[gameKey] || 0;
    const newBest = Math.max(prevBest, score);
    this.state.bestScores[gameKey] = newBest;
    this.state.coins += reward;
    this.state.counters.gamesWon++;
    if (this.state.counters.gamesWon === 1) {
      this.milestone('win', 'First arcade win', 'A legend is born in the cabinet room.');
    }
    this.state.stats.happy = Math.min(100, this.state.stats.happy + 20);
    this.state.stats.weight = Math.max(1.0, this.state.stats.weight - 0.2);
    personality.applyEvents(this.state.personality, [{ trait: 'ego', amount: 4 }, { trait: 'greed', amount: 1 }]);
    this.memory(`Won ${gameLabel(gameKey)} with ${score} points.`, '\uD83C\uDFAE', 3);

    const scr = hud.$('game-over-screen');
    scr.classList.remove('hidden');
    hud.$('go-score').innerText = `Score: ${score}  \u00B7  Best: ${newBest}`;
    hud.$('go-reward').innerText = `+${reward} Coins!`;
    hud.$('go-msg').innerText = prevBest > 0 && newBest > prevBest
      ? 'NEW BEST. The simulation audibly gasped.'
      : prevBest > 0
        ? 'Solid run. The sim has seen better.'
        : 'First run on record. History starts NOW.';
    hud.$('go-msg2')?.remove();

    this.gainXp(reward > 0 ? 20 : 10);
    this.updateUI();
    this.save();
  }

  // ---------------------------------------------------------- modal close
  // ---------- side bro (multi-pet)
  spawnSideBro() {
    if (this.state.sideBro) {
      this.say('Zeke is already here. Look to the right.');
      return;
    }
    if (this.state.coins < 75) {
      this.audio.playHit();
      this.say('Need 75c to summon a companion, bro.');
      return;
    }
    spawnSecondBro(this.state);
    this.audio.playLevelUp();
    this.memory('Zeke the capybara arrived. Dual-bro era begins.', '🦫', 4);
    this.say('Zeke spawned! A capybara companion. Feed him snacks, he might drop coins.');
    this.updateUI();
    this.save();
  }

  petSideBro() {
    if (!this.state.sideBro) return;
    this.audio.playBeep();
    const gotCoin = petSideBro(this.state);
    if (gotCoin) {
      this.say('Zeke dropped a coin! The capybara economy is real.');
      this.audio.playCoin();
    } else {
      this.say(sideBroLine(this.state) || 'Zeke appreciates the attention. Probably.');
    }
    this.updateUI();
    this.save();
  }

  feedSideBro() {
    if (!this.state.sideBro) return;
    feedSideBro(this.state);
    this.audio.playEat();
    this.say('Zeke ate. His hunger bar thanks you silently.');
    this.updateUI();
    this.save();
  }

  closeModals() {
    this.audio.playBeep();
    modals.closeAll();
  }
}

// ------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------
function gameLabel(key) {
  return { flappy: 'Flappy Bro', breaker: 'Pixel Breaker', mario: 'Super Bro Land', rpg: 'Final Bro-tasy', loot: 'Loot Shower' }[key] || key;
}
