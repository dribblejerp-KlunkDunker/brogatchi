// 🎹 CHIPTUNE COMPOSER — a tiny in-browser tracker for the 5 game loops.
// Edits go straight into the shared TRACKS objects, so whatever you write
// here is what plays in the games too (until a reload). The running sequencer
// picks edits up live; the Play button restarts from step 0 so you can hear
// the top of the loop.

import { $ } from './hud.js';
import { openModal, closeAll } from './modals.js';
import { TRACKS, setNote, setBpm, resetTrack } from './audio.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const LANES = ['lead', 'bass', 'hat'];
const LANE_LABELS = { lead: 'LEAD', bass: 'BASS', hat: 'HAT' };
const PITCH_CHIPS = [0, 48, 55, 60, 62, 64, 67, 69, 72, 76]; // rest, C3..E5

export function midiName(m) {
  if (!m) return '·';
  return NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1);
}

let audio = null;
let built = false;
let selected = { id: 'flappy', lane: 'lead', idx: 0 };
let playCheckTimer = null;
const cells = {}; // lane -> array of button elements

export function attach(eng) {
  audio = eng;
}

export function isOpen() {
  const m = $('modal-composer');
  return !!m && m.style.display === 'flex';
}

export function toggle() {
  if (isOpen()) closeAll();
  else openPanel();
}

function openPanel() {
  if (!built) build();
  renderAll();
  openModal('modal-composer');
  if (!playCheckTimer) playCheckTimer = setInterval(tick, 80);
}

function build() {
  built = true;

  // track chips
  const tracks = $('comp-tracks');
  Object.keys(TRACKS).forEach((id) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.dataset.id = id;
    chip.textContent = id.toUpperCase();
    chip.title = TRACKS[id].name;
    chip.className = 'pixel-btn px-2 py-1 text-[8px] bg-slate-700 text-white';
    chip.onclick = () => { selected.id = id; selected.idx = 0; renderAll(); };
    tracks.appendChild(chip);
  });

  // grid headline (step numbers, bar break after 8)
  const grid = $('comp-grid');
  const head = document.createElement('div');
  head.className = 'flex gap-[3px] mb-1';
  head.innerHTML =
    '<span class="w-11"></span>' +
    Array.from({ length: 16 }, (_, i) =>
      `<span class="comp-idx${i % 8 === 0 ? ' bar' : ''}" style="width:18px;display:inline-block;text-align:center">${i}</span>`
    ).join('');
  grid.appendChild(head);

  // lanes
  LANES.forEach((lane) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'flex items-center gap-[3px] mb-[2px]';
    const lab = document.createElement('span');
    lab.className = 'w-11 text-[7px] text-cyan-500';
    lab.textContent = LANE_LABELS[lane];
    rowEl.appendChild(lab);
    cells[lane] = [];
    for (let i = 0; i < 16; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.lane = lane;
      b.dataset.idx = i;
      b.className = 'comp-cell';
      b.onclick = () => onCell(lane, i);
      rowEl.appendChild(b);
      cells[lane].push(b);
    }
    grid.appendChild(rowEl);
  });

  // transport
  $('comp-play').onclick = togglePlay;
  $('comp-bpm').onchange = (e) => {
    setBpm(selected.id, Number(e.target.value) || 0);
    e.target.value = TRACKS[selected.id].bpm;
  };

  // editor: MIDI number + pitch chips
  $('comp-midi').onchange = (e) => applyMidi(Number(e.target.value) || 0);
  $('comp-midi').onkeydown = (e) => {
    // up/down nudges the value like a mini trimmer
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = TRACKS[selected.id][selected.lane][selected.idx] || 0;
      applyMidi(Math.max(0, Math.min(127, cur + (e.key === 'ArrowUp' ? 1 : -1))));
    }
  };
  const chips = $('comp-chips');
  PITCH_CHIPS.forEach((m) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.textContent = m === 0 ? '·' : midiName(m);
    c.className = 'pixel-btn px-1 py-0.5 text-[8px] bg-cyan-800 text-white';
    c.onclick = () => applyMidi(m);
    chips.appendChild(c);
  });

  $('comp-reset').onclick = () => {
    resetTrack(selected.id);
    renderAll();
    restartIfPlaying();
  };
}

function renderAll() {
  if (!built) return;
  // chips
  document.querySelectorAll('#comp-tracks [data-id]').forEach((c) => {
    c.classList.toggle('bg-green-600', c.dataset.id === selected.id);
  });
  // cells
  LANES.forEach((lane) => {
    const arr = TRACKS[selected.id][lane];
    cells[lane].forEach((b, i) => {
      const v = arr[i];
      if (lane === 'hat') {
        b.textContent = v ? 'X' : '';
        b.classList.toggle('on', !!v);
      } else {
        b.textContent = midiName(v);
      }
      b.classList.toggle('sel', lane === selected.lane && i === selected.idx);
    });
  });
  $('comp-bpm').value = TRACKS[selected.id].bpm;
  $('comp-midi').value = TRACKS[selected.id][selected.lane][selected.idx];
  tick();
}

function onCell(lane, idx) {
  selected.lane = lane;
  selected.idx = idx;
  if (lane === 'hat') {
    const next = TRACKS[selected.id].hat[idx] ? 0 : 1;
    setNote(selected.id, 'hat', idx, next);
  }
  renderAll();
}

function applyMidi(m) {
  if (selected.lane === 'hat') return;
  if (setNote(selected.id, selected.lane, selected.idx, m)) {
    renderAll();
    restartIfPlaying();
  }
}

function togglePlay() {
  if (!audio) return;
  if (audio.music && audio.music.track === TRACKS[selected.id]) {
    audio.stopMusic();
    updatePlayBtn();
    return;
  }
  if (!audio.musicEnabled) audio.toggleMusic(); // they want to hear it
  audio.startMusic(selected.id); // restarts from step 0
  updatePlayBtn();
}

function restartIfPlaying() {
  if (audio && audio.music && audio.music.track === TRACKS[selected.id]) {
    audio.startMusic(selected.id);
  }
}

function updatePlayBtn() {
  const btn = $('comp-play');
  if (!btn) return;
  const playing = !!(audio && audio.music && audio.music.track === TRACKS[selected.id]);
  btn.textContent = playing ? '⏹ STOP' : '▶ PLAY';
  btn.classList.toggle('bg-red-500', playing);
  btn.classList.toggle('bg-green-700', !playing);
  const st = $('comp-status');
  if (st) {
    st.textContent = playing ? '● playing' : (audio && !audio.musicEnabled ? '🔇 muted' : '');
  }
}

// highlight the column the sequencer is currently on, keep the button honest
function tick() {
  if (!isOpen()) {
    clearInterval(playCheckTimer);
    playCheckTimer = null;
    return;
  }
  if (!built) return;
  let col = -1;
  if (audio && audio.music && audio.music.track === TRACKS[selected.id]) {
    col = audio.music.step % 16;
  }
  LANES.forEach((lane) => {
    cells[lane].forEach((b, i) => {
      b.classList.toggle('active', i === col);
    });
  });
  updatePlayBtn();
}