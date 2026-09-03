// Modal handling: open/close plus the rendered content modals (stats, diary, tasks).

import { $ } from './hud.js';
import { xpToNext, FORME_INFO } from '../core/evolution.js';
import { TRAITS } from '../core/personality.js';

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
      state.memories.forEach((m) => {
        mem.innerHTML += `<div class="text-[8px] bg-gray-100 p-1 border border-black">${m.icon} ${m.text} <span class="opacity-50">· ${m.day}</span></div>`;
      });
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