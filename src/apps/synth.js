// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/apps/synth.js — CHIPTUNE.SYNTH (remix lab)
// A live editor for the arcade's chiptune loops. Load any cabinet's
// track — base loop or milestone tier — edit its lead/bass/drum lanes
// on a piano roll while it runs, and SAVE the remix: the store keeps
// it and src/gameMusic.js plays your version in that cabinet.
// ═══════════════════════════════════════════════════════════

import { TRACKSETS } from '../gameMusic.js';

const STEPS = 16;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const midiName = (m) => `${NOTE_NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const cloneTrack = (t) => ({ name: t.name, bpm: t.bpm, lead: [...t.lead], bass: [...t.bass], hat: [...t.hat] });

// The three lanes every game track carries, in edit order. `play` voices a
// note through the same engine voices the arcade loop uses, so the editor
// previews exactly what the cabinet will sound like.
const VOICES = [
  { id: 'lead', label: 'LEAD', play: (audio, midi, dur) => audio.leadNote(midiFreq(midi), dur) },
  { id: 'bass', label: 'BASS', play: (audio, midi, dur) => audio.bassNote(midiFreq(midi), dur) },
  { id: 'hat', label: 'DRUM', play: (audio) => audio.hat(0.5) },
];

export function startSynth(container, { audio, store, rng = Math.random }) {
  const GAME_IDS = Object.keys(TRACKSETS);
  let gameId = GAME_IDS[0];
  let tier = 0;
  let voice = 'lead';
  let original = null;  // the stock loop for this game+tier (row span + RESTORE)
  let track = null;     // the working copy every edit lands in
  let playing = false;
  let timer = null;
  let step = 0;
  let bar = 1;   // 1-based, for the readout
  let beat = 1;  // 1-based, for the readout

  container.innerHTML = `
    <div class="font-mono text-[10px]">
      <div class="flex items-center justify-between mb-2 border-b border-border pb-2">
        <span class="font-display text-[11px] tracking-widest text-neon-green text-glow-green">CHIPTUNE.SYNTH</span>
        <span class="text-text-muted">REMIX LAB · SQ × TRI × NOISE</span>
      </div>
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <span class="text-text-muted">TRACK</span>
        <select id="synth-track" class="btn-cyber text-[9px] py-0" aria-label="Cabinet track"></select>
        <span class="text-text-muted">TIER</span>
        <select id="synth-tier" class="btn-cyber text-[9px] py-0" aria-label="Loop tier"></select>
        <button id="synth-play" class="btn-cyber text-[9px]">▶ RUN</button>
      </div>
      <div class="flex items-center gap-2 mb-2">
        <div id="synth-voices" class="flex gap-1"></div>
        <div id="synth-beats" class="flex gap-[3px] ml-2" aria-hidden="true"></div>
        <span id="synth-barbeat" class="text-neon-cyan ml-2 tabular-nums w-24">BAR 1 · BEAT 1</span>
        <span class="text-text-muted ml-auto">BPM</span>
        <input id="synth-bpm" type="range" min="60" max="200" class="w-24 accent-[var(--color-neon-green)]" aria-label="BPM">
        <span id="synth-bpm-val" class="text-neon-green w-7 text-right"></span>
      </div>
      <div class="overflow-auto border border-border bg-void/50 p-2" style="max-height:32vh">
        <div id="synth-grid" class="grid gap-1" style="grid-template-columns:2.4rem repeat(${STEPS}, minmax(0,1fr));"></div>
      </div>
      <div class="flex flex-wrap items-center gap-2 mt-2">
        <button id="synth-save" class="btn-cyber text-[9px]">SAVE REMIX</button>
        <button id="synth-restore" class="btn-cyber text-[9px]">RESTORE STOCK</button>
        <button id="synth-clear" class="btn-cyber text-[9px]">CLEAR LANE</button>
        <button id="synth-random" class="btn-cyber text-[9px]">RANDOMIZE</button>
      </div>
      <p id="synth-status" class="text-neon-amber mt-2 min-h-[14px]"></p>
      <p class="text-text-muted mt-1">Edit while it runs — the grid is live. SAVE bakes the loop into that cabinet's run.</p>
    </div>`;

  const gameSelect = container.querySelector('#synth-track');
  const tierSelect = container.querySelector('#synth-tier');
  const voicesEl = container.querySelector('#synth-voices');
  const grid = container.querySelector('#synth-grid');
  const playBtn = container.querySelector('#synth-play');
  const bpmInput = container.querySelector('#synth-bpm');
  const bpmVal = container.querySelector('#synth-bpm-val');
  const statusEl = container.querySelector('#synth-status');
  const barBeatEl = container.querySelector('#synth-barbeat');
  const beatsEl = container.querySelector('#synth-beats');

  const stock = (id, t) => TRACKSETS[id]?.[t] || TRACKSETS[id][0];
  const setStatus = (text) => { statusEl.textContent = text; };

  /* ─────────── rows: the piano roll's pitch ladder ─────────── */

  // The stock loop's own span, padded two semitones each way so a remix can
  // push past the original melody. Derived from `original`, never the working
  // copy, so the ladder can't collapse mid-edit. DRUM has no pitch: one row.
  function rows() {
    if (voice === 'hat') return [1];
    const used = original[voice].filter((n) => n > 0);
    if (!used.length) return [60];
    const lo = Math.min(...used) - 2;
    const hi = Math.max(...used) + 2;
    const out = [];
    for (let m = hi; m >= lo; m--) out.push(m);
    return out;
  }

  const isOn = (row, s) => (voice === 'hat' ? !!track.hat[s] : track[voice][s] === row);

  function markPlayhead() {
    grid.querySelectorAll('.synth-cell').forEach((c) => {
      c.classList.toggle('playhead', playing && Number(c.dataset.step) === step);
    });
  }

  // The running loop's position, visible without hunting the grid: a numeric
  // readout (BAR n · BEAT n, beats = quarter notes = 2 steps) and a 16-lamp
  // strip where the current step's lamp lights while it plays.
  function buildBeatLamps() {
    beatsEl.innerHTML = '';
    for (let s = 0; s < STEPS; s++) {
      const lamp = document.createElement('span');
      lamp.className = 'synth-lamp';
      lamp.dataset.step = String(s);
      if (s % 4 === 0) lamp.classList.add('down'); // the bar's quarter beats
      beatsEl.appendChild(lamp);
    }
  }

  function markBeats() {
    beatsEl.querySelectorAll('.synth-lamp').forEach((l) => {
      l.classList.toggle('lit', playing && Number(l.dataset.step) === step);
    });
    barBeatEl.textContent = playing ? `BAR ${bar} · BEAT ${beat}` : '■ STOPPED';
  }

  function buildGrid() {
    grid.innerHTML = '';
    for (const row of rows()) {
      const label = document.createElement('span');
      label.className = 'text-text-muted self-center text-[8px]';
      label.textContent = voice === 'hat' ? 'HAT' : midiName(row);
      grid.appendChild(label);
      for (let s = 0; s < STEPS; s++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'synth-cell' + (isOn(row, s) ? ' on' : '');
        cell.dataset.row = row;
        cell.dataset.step = s;
        cell.setAttribute('aria-label', `${voice === 'hat' ? 'hat' : midiName(row)} step ${s + 1}`);
        cell.addEventListener('click', () => toggleCell(row, s));
        grid.appendChild(cell);
      }
    }
    markPlayhead();
  }

  // A lane is monophonic per step, so turning a note on repaints its whole
  // column: the pitch that used to be there is gone.
  function toggleCell(row, s) {
    audio?.init?.(); // autoplay policy: a cell click IS a user gesture
    if (voice === 'hat') {
      track.hat[s] = track.hat[s] ? 0 : 1;
      if (track.hat[s]) audio?.hat?.(0.5);
    } else {
      const on = track[voice][s] === row;
      track[voice][s] = on ? 0 : row;
      if (!on) VOICES.find((v) => v.id === voice).play(audio, row, 0.12);
    }
    // The placed note is the placement sound; the UI blip only marks removal,
    // where it would otherwise play on top of (and drown) the preview.
    if (!isOn(row, s)) audio?.click?.();
    grid.querySelectorAll(`.synth-cell[data-step="${s}"]`).forEach((c) => {
      c.classList.toggle('on', isOn(Number(c.dataset.row), s));
    });
    setStatus('EDITING — SAVE to bake it into the cabinet');
  }

  function tick() {
    markPlayhead();
    markBeats();
    const stepDur = 60 / track.bpm / 2; // 8th notes, same grid as gameMusic
    for (const v of VOICES) {
      const note = track[v.id][step];
      if (note) v.play(audio, note, v.id === 'bass' ? stepDur * 1.7 : stepDur * 0.92);
    }
    step = (step + 1) % STEPS;
    if (step % 2 === 0) {          // quarter-note boundary → next beat
      beat = (beat % 4) + 1;
      if (beat === 1) bar++;
    }
  }

  function schedule() {
    clearInterval(timer);
    timer = setInterval(tick, 60000 / track.bpm / 2);
    if (typeof timer?.unref === 'function') timer.unref();
  }

  function setPlaying(on) {
    playing = on;
    clearInterval(timer);
    if (playing) { step = 0; bar = 1; beat = 1; schedule(); }
    playBtn.textContent = playing ? '■ HALT' : '▶ RUN';
    markPlayhead();
    markBeats();
  }

  /* ─────────── selection: which cabinet loop is on the bench ─────────── */

  function renderTierOptions() {
    tierSelect.innerHTML = '';
    TRACKSETS[gameId].forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      const mark = store?.remixFor?.(gameId, i) ? ' ✎' : '';
      opt.textContent = `${i === 0 ? 'BASE' : `T${i}`} — ${t.name}${mark}`;
      tierSelect.appendChild(opt);
    });
    tierSelect.value = String(tier);
  }

  function loadSelection() {
    original = cloneTrack(stock(gameId, tier));
    const saved = store?.remixFor?.(gameId, tier);
    track = cloneTrack(saved || original);
    bpmInput.value = String(track.bpm);
    bpmVal.textContent = String(track.bpm);
    renderTierOptions();
    buildGrid();
    setStatus(saved ? 'REMIX LOADED — tweak and SAVE' : 'STOCK LOOP — tweak and SAVE');
  }

  GAME_IDS.forEach((id) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${id.toUpperCase()} — ${TRACKSETS[id][0].name}`;
    gameSelect.appendChild(opt);
  });
  gameSelect.value = gameId;

  VOICES.forEach((v) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-cyber text-[8px]';
    btn.dataset.voice = v.id;
    btn.textContent = v.label;
    btn.addEventListener('click', () => {
      voice = v.id;
      audio?.click?.();
      [...voicesEl.children].forEach((b) => b.classList.toggle('border-neon-magenta', b.dataset.voice === voice));
      buildGrid();
    });
    voicesEl.appendChild(btn);
  });
  [...voicesEl.children][0].classList.add('border-neon-magenta');

  gameSelect.addEventListener('change', () => {
    gameId = gameSelect.value;
    tier = 0;
    audio?.click?.();
    loadSelection();
  });

  tierSelect.addEventListener('change', () => {
    tier = Number(tierSelect.value);
    audio?.click?.();
    loadSelection();
  });

  playBtn.addEventListener('click', () => setPlaying(!playing));

  bpmInput.addEventListener('input', () => {
    track.bpm = Number(bpmInput.value);
    bpmVal.textContent = String(track.bpm);
    if (playing) schedule();
    setStatus('EDITING — SAVE to bake it into the cabinet');
  });

  container.querySelector('#synth-save').addEventListener('click', () => {
    audio?.click?.();
    const ok = store?.setRemix?.(gameId, tier, track);
    renderTierOptions();
    setStatus(ok ? 'REMIX SAVED — the cabinet plays this now' : 'SAVE FAILED — loop rejected');
  });

  container.querySelector('#synth-restore').addEventListener('click', () => {
    audio?.click?.();
    store?.clearRemix?.(gameId, tier);
    track = cloneTrack(original);
    bpmInput.value = String(track.bpm);
    bpmVal.textContent = String(track.bpm);
    renderTierOptions();
    buildGrid();
    setStatus('RESTORED TO STOCK — cabinet back to the original loop');
  });

  container.querySelector('#synth-clear').addEventListener('click', () => {
    audio?.click?.();
    track[voice] = new Array(STEPS).fill(0);
    buildGrid();
    setStatus(`LANE CLEARED — ${voice.toUpperCase()} is silent`);
  });

  // Keep the rhythm, move the pitches: a one-click remix that still sounds
  // like the cabinet. Pulls from an injectable rng so tests stay deterministic.
  container.querySelector('#synth-random').addEventListener('click', () => {
    audio?.click?.();
    if (voice === 'hat') {
      track.hat = Array.from({ length: STEPS }, () => (rng() < 0.5 ? 1 : 0));
    } else {
      const span = rows();
      const lo = span[span.length - 1];
      const hi = span[0];
      track[voice] = original[voice].map((n) => {
        if (!n) return n;
        return Math.max(lo, Math.min(hi, n + Math.round(rng() * 4) - 2));
      });
    }
    buildGrid();
    setStatus('RANDOMIZED — SAVE it or run it again');
  });

  buildBeatLamps();
  markBeats();
  loadSelection();

  // Debug/test handle (same convention as the arcade's canvas.__game):
  // lets the shell and vitest read what's currently on the bench.
  container.__synth = { state: () => ({ gameId, tier, voice, playing, track: cloneTrack(track) }) };

  return function stop() {
    clearInterval(timer);
    playing = false;
  };
}
