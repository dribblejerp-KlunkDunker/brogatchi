// ═══════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/apps/synth.js — CHIPTUNE.SYNTH
// An 8-step × 5-row square-wave sequencer. This is the composer
// teased in the Phase-2 template — now actually playable.
// ═══════════════════════════════════════════════════════════

// A-minor pentatonic — everything sounds decent on it
const ROWS = [
  { note: 'G4', freq: 392.0 },
  { note: 'E4', freq: 329.63 },
  { note: 'D4', freq: 293.66 },
  { note: 'C4', freq: 261.63 },
  { note: 'A3', freq: 220.0 },
];
const STEPS = 8;

const PRESETS = {
  OFFBEAT: [
    [0,0,0,0,0,0,0,0],
    [0,0,1,0,0,0,1,0],
    [1,0,0,0,1,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,0,0,1,0,0,0,1],
  ],
  RAIN: [
    [1,0,0,1,0,0,1,0],
    [0,1,0,0,1,0,0,0],
    [0,0,1,0,0,1,0,1],
    [0,0,0,0,0,0,0,0],
    [1,0,0,0,1,0,0,0],
  ],
  CLEAR: Array.from({ length: 5 }, () => Array(STEPS).fill(0)),
};

export function startSynth(container, { audio, getBpmState }) {
  let pattern = PRESETS.OFFBEAT.map((r) => [...r]);
  let playing = false;
  let timer = null;
  let stepIdx = 0;
  let bpm = getBpmState?.() || 120;

  container.innerHTML = `
    <div class="font-mono text-[10px]">
      <div class="flex items-center justify-between mb-2 border-b border-border pb-2">
        <span class="font-display text-[11px] tracking-widest text-neon-green text-glow-green">CHIPTUNE.SYNTH</span>
        <span class="text-text-muted">SQ.WAVE × ${ROWS.length} CH</span>
      </div>
      <div class="flex items-center gap-2 mb-3">
        <button id="synth-play" class="btn-cyber text-[9px]">▶ RUN</button>
        <span class="text-text-muted">BPM</span>
        <input id="synth-bpm" type="range" min="60" max="200" value="${bpm}" class="flex-1 accent-[var(--color-neon-green)]" aria-label="BPM">
        <span id="synth-bpm-val" class="text-neon-green w-7 text-right">${bpm}</span>
      </div>
      <div class="grid gap-1" style="grid-template-columns: 2.2rem repeat(${STEPS}, 1fr);" id="synth-grid"></div>
      <div class="flex gap-2 mt-3">
        <span class="text-text-muted self-center">PRESET:</span>
        ${Object.keys(PRESETS).map((p) => `<button data-preset="${p}" class="btn-cyber text-[8px]">${p}</button>`).join('')}
      </div>
      <p class="text-text-muted mt-3">Notes are square waves generated live by the OS audio core — no samples, no MP3s. The tidepool approves.</p>
    </div>`;

  const grid = container.querySelector('#synth-grid');
  const playBtn = container.querySelector('#synth-play');
  const bpmInput = container.querySelector('#synth-bpm');
  const bpmVal = container.querySelector('#synth-bpm-val');

  function buildGrid() {
    grid.innerHTML = '';
    ROWS.forEach((row, r) => {
      const label = document.createElement('span');
      label.className = 'text-text-muted self-center text-[9px]';
      label.textContent = row.note;
      grid.appendChild(label);
      for (let s = 0; s < STEPS; s++) {
        const cell = document.createElement('button');
        cell.className = 'synth-cell' + (pattern[r][s] ? ' on' : '');
        cell.setAttribute('aria-label', `${row.note} step ${s + 1}`);
        cell.addEventListener('click', () => {
          pattern[r][s] = pattern[r][s] ? 0 : 1;
          cell.classList.toggle('on', !!pattern[r][s]);
          if (pattern[r][s]) audio?.note(row.freq, 0.12);
        });
        cell.dataset.r = r; cell.dataset.s = s;
        grid.appendChild(cell);
      }
    });
  }

  function markPlayhead() {
    grid.querySelectorAll('.synth-cell').forEach((c) => {
      c.classList.toggle('playhead', Number(c.dataset.s) === stepIdx);
    });
  }

  function tickStep() {
    markPlayhead();
    ROWS.forEach((row, r) => { if (pattern[r][stepIdx]) audio?.note(row.freq, 0.18); });
    stepIdx = (stepIdx + 1) % STEPS;
  }

  function schedule() {
    clearInterval(timer);
    const stepDur = 60000 / bpm / 2; // 8th notes
    timer = setInterval(tickStep, stepDur);
  }

  playBtn.addEventListener('click', () => {
    playing = !playing;
    if (playing) {
      stepIdx = 0;
      schedule();
      playBtn.textContent = '■ HALT';
    } else {
      clearInterval(timer);
      grid.querySelectorAll('.playhead').forEach((c) => c.classList.remove('playhead'));
      playBtn.textContent = '▶ RUN';
    }
  });

  bpmInput.addEventListener('input', () => {
    bpm = Number(bpmInput.value);
    bpmVal.textContent = bpm;
    if (playing) schedule();
  });

  container.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      pattern = PRESETS[b.dataset.preset].map((r) => [...r]);
      audio?.click();
      buildGrid();
      if (playing) markPlayhead();
    }));

  buildGrid();

  return function stop() { clearInterval(timer); };
}
