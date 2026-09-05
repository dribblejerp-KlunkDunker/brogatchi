// Modal handling: open/close plus the rendered content modals (stats, diary, tasks).

import { $ } from './hud.js';
import { xpToNext, FORME_INFO } from '../core/evolution.js';
import { TRAITS } from '../core/personality.js';
import { recallArchive, ARCHIVE_VIEW } from '../core/memory.js';

export function openModal(id) {
  const m = $(id);
  if (m) m.style.display = 'flex';
}

export function closeAll() {
  document.querySelectorAll('.modal').forEach((m) => (m.style.display = 'none'));
}

export function renderStats(state) {
  const high = $('stat-high');
  const today = $('stat-today');
  const hist = $('stat-history');
  if (high) high.innerText = `${state.stepRecord} steps`;
  if (today) today.innerText = `${state.steps} steps`;
  if (!hist) return;
  hist.innerHTML = '';
  const dates = Object.keys(state.stepHistory).sort((a, b) => new Date(b) - new Date(a));
  if (!dates.length) {
    hist.innerHTML = '<div class="text-gray-500 text-center italic mt-2">No past history yet. Get walking!</div>';
    return;
  }
  dates.forEach((date) => {
    hist.innerHTML += `
      <div class="flex justify-between bg-gray-100 p-1 px-2 border border-black text-[9px]">
        <span>${date}</span>
        <span class="font-bold">${state.stepHistory[date]} steps</span>
      </div>`;
  });
}

export function renderDiary(state) {
  const lvl = $('d-level');
  const forme = $('d-forme');
  const title = $('d-title');
  if (lvl) lvl.innerText = `${state.level} (${state.xp}/${xpToNext(state.level)} XP)`;
  if (forme) forme.innerText = state.forme ? FORME_INFO[state.forme].label : 'Not evolved yet';
  if (title) title.innerText = state.title || '—';

  const pers = $('d-personality');
  if (pers) {
    pers.innerHTML = '';
    TRAITS.forEach((t) => {
      const val = state.personality[t.key];
      pers.innerHTML += `
        <div class="flex items-center gap-2">
          <span class="w-16">${t.icon} ${t.label}</span>
          <div class="flex-1 h-2 bg-gray-300 border border-black rounded-full overflow-hidden">
            <div class="h-full rounded-full" style="width:${val}%;background:${traitColor(t.key)}"></div>
          </div>
          <span class="w-7 text-right">${Math.round(val)}</span>
        </div>`;
    });
  }

  const mem = $('memories-content');
  if (mem) {
    mem.innerHTML = '';
    if (!state.memories.length) {
      mem.innerHTML = '<div class="text-gray-500 italic">No memories yet. Go live a little.</div>';
    } else {
      const pinned = state.memories.filter((m) => m.pinned);
      const rest = state.memories.filter((m) => !m.pinned);
      if (pinned.length) {
        mem.innerHTML += '<div class="text-[8px] font-bold text-amber-600 mb-0.5">📌 PINNED — these never fade</div>';
        pinned.forEach((m) => { mem.innerHTML += memoryRow(m, true); });
        if (rest.length) mem.innerHTML += '<div class="text-[8px] font-bold text-gray-500 mt-1 mb-0.5">RECENT</div>';
      }
      rest.forEach((m) => { mem.innerHTML += memoryRow(m, false); });
    }
    // The long-term shelf: what the cap churned out, searchable, never deleted.
    const archive = state.memoryArchive || [];
    if (archive.length) {
      const q = (state.memoryArchiveQuery || '').trim();
      const hits = q ? recallArchive(archive, q, ARCHIVE_VIEW) : archive.slice(0, ARCHIVE_VIEW);
      mem.innerHTML += `<div class="flex items-center gap-1 mt-2 mb-0.5">
        <div class="text-[8px] font-bold text-sky-700">🗄 ARCHIVE · ${archive.length} stored</div>
        <input id="memory-archive-search" value="${q.replace(/"/g, '&quot;')}" placeholder="search…" maxlength="40"
          class="flex-1 min-w-0 text-[8px] px-1 py-0.5 border border-black bg-white" />
      </div>`;
      hits.forEach((m) => { mem.innerHTML += archiveRow(m); });
      if (!hits.length) mem.innerHTML += '<div class="text-[8px] text-gray-400 italic">Nothing in the archive matches.</div>';
    }
  }

  const diary = $('diary-content');
  if (diary) {
    diary.innerHTML = '';
    if (!state.diaries.length) {
      diary.innerHTML = '<div class="text-gray-500 italic">No diary entries yet. Day one is being written…</div>';
    } else {
      state.diaries.forEach((d) => {
        diary.innerHTML += `
          <div class="text-[8px] bg-amber-50 p-1.5 border border-black">
            <div class="font-bold mb-0.5">📅 ${d.date}</div>
            ${d.lines.map((l) => `<div>• ${l}</div>`).join('')}
          </div>`;
      });
    }
  }
}

// One row on the archive shelf: dimmer than living memories — they already
// happened. No pin toggle here; restore keeps the archive pristine.
function archiveRow(m) {
  return `<div class="text-[8px] bg-sky-50 p-1 border border-sky-300 flex items-start gap-1">
    <span class="opacity-60">🗄</span>
    <span class="flex-1 opacity-80">${m.icon} ${m.text} <span class="opacity-50">· archived ${m.day}</span></span>
    <button type="button" class="mem-restore text-sky-700 hover:text-sky-900" onclick="app.restoreMemory('${m.id}')" title="Move back into working memory" aria-label="Restore memory">↩</button>
  </div>`;
}

// One row in the memory log: a pin/unpin toggle + the memory itself.
function memoryRow(m, pinned) {
  return `<div class="text-[8px] bg-gray-100 p-1 border border-black flex items-start gap-1">
    <button type="button" class="mem-pin ${pinned ? 'text-amber-600' : 'text-gray-300 hover:text-amber-500'}" onclick="app.pinMemory('${m.id}')" title="${pinned ? 'Unpin' : 'Pin — keep forever'}" aria-label="${pinned ? 'Unpin memory' : 'Pin memory'}">📌</button>
    <span class="flex-1">${m.icon} ${m.text} <span class="opacity-50">· ${m.day}</span></span>
  </div>`;
}

function traitColor(key) {
  const map = { paranoia: '#a855f7', ego: '#f59e0b', gluttony: '#ef4444', fitness: '#22c55e', broCode: '#3b82f6', greed: '#eab308' };
  return map[key] || '#94a3b8';
}

// Daily claim quests — conditions checked against today's counters.
export const CLAIM_QUESTS = [
  { key: 'win1', label: '🎮 Win any game today', reward: 15, ok: (s) => s.counters.gamesWon >= 1 },
  { key: 'steps100', label: '👟 Log 100 steps', reward: 20, ok: (s) => s.counters.steps >= 100 },
  { key: 'pet10', label: '🤝 Pet Ryan 10 times', reward: 10, ok: (s) => s.counters.pet >= 10 },
  { key: 'snacks3', label: '🍕 Buy 3 snacks', reward: 12, ok: (s) => s.counters.pizzas + s.counters.burgers + s.counters.fuels >= 3 },
];

export function renderClaims(state) {
  const box = $('quest-claims');
  if (!box) return;
  box.innerHTML = '';
  CLAIM_QUESTS.forEach((q) => {
    const done = !!state.claims[q.key];
    const met = q.ok(state);
    box.innerHTML += `
      <button class="pixel-btn p-2 text-[8px] text-left flex justify-between items-center ${done ? 'opacity-40' : met ? 'bg-green-200' : ''}"
        onclick="app.claimDaily('${q.key}')" ${done ? 'disabled' : ''}>
        <span>${q.label} (+${q.reward}c)</span>
        <span>${done ? 'CLAIMED ✓' : met ? 'READY ▶' : 'LOCKED'}</span>
      </button>`;
  });
}