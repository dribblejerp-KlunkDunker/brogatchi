// Renders the Evolution Journal modal: before/after summary, per-trait
// personality sparklines across the save, and the milestone timeline with
// Ryan's SVG screenshot at each moment.

import { $ } from './hud.js';
import { TRAITS } from '../core/personality.js';
import { JOURNAL_TYPES, describeChange } from '../core/journal.js';
import { weightTier, TIER_NAMES } from '../core/stats.js';

const TRAIT_COLORS = {
  paranoia: '#a855f7',
  ego: '#f59e0b',
  gluttony: '#ef4444',
  fitness: '#22c55e',
  broCode: '#3b82f6',
};

export function renderJournal(state) {
  const j = state.journal;
  const start = j[0];
  const now = state;

  renderHeader(j, start, now);
  renderPersonality(j, start, now);
  renderTimeline(j);
}

function renderHeader(j, start, now) {
  const header = $('j-header');
  if (!header) return;
  const first = start || now;
  const stats = [
    ['LVL', `${first.level} → ${now.level}`],
    ['COINS', `${first.coins} → ${now.coins}`],
    ['TIER', `${first.tierName} → ${TIER_NAMES[weightTier(now.stats.weight)]}`],
    ['FORME', `${first.forme || '—'} → ${now.forme || '—'}`],
  ];
  header.innerHTML = stats
    .map(
      ([k, v]) => `
      <div class="bg-fuchsia-100 border border-black p-1 text-center">
        <div class="text-[6px] opacity-70">${k}</div>
        <div class="text-[9px] font-bold break-words">${v}</div>
      </div>`
    )
    .join('');
  if (!j.length) header.innerHTML = '<div class="col-span-4 text-center text-[9px] opacity-60">No history yet — live a little.</div>';
}

function renderPersonality(j, start, now) {
  const box = $('j-personality');
  if (!box) return;
  box.innerHTML = TRAITS.map((t) => {
    const col = TRAIT_COLORS[t.key];
    const series = j.map((e) => e.personality?.[t.key] ?? 0);
    const then = start?.personality?.[t.key] ?? now.personality[t.key];
    const cur = now.personality[t.key];
    return `
      <div class="mb-1.5">
        <div class="flex justify-between text-[7px] text-gray-600">
          <span>${t.icon} ${t.label}</span>
          <span>${Math.round(then)}% → ${Math.round(cur)}%</span>
        </div>
        ${spark(series, col)}
      </div>`;
  }).join('');
}

function spark(series, color) {
  const w = 168;
  const h = 20;
  const pad = 2;
  if (series.length <= 1) series = [series[0] ?? 0, series[0] ?? 0];
  const min = 0;
  const max = 100;
  const step = (w - pad * 2) / (series.length - 1 || 1);
  const pts = series
    .map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = pts.split(' ').pop();
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-4" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${last.split(',')[0]}" cy="${last.split(',')[1]}" r="2.4" fill="${color}"/>
  </svg>`;
}

function renderTimeline(j) {
  const box = $('j-timeline');
  if (!box) return;
  const rev = [...j].reverse();
  box.innerHTML = rev
    .map((e, i) => {
      const prevChrono = j[j.length - i - 2];
      const change = describeChange(prevChrono, e);
      const meta = JOURNAL_TYPES[e.type] || { icon: '📌', label: e.label || 'Milestone' };
      const imgSrc = e.svg
        ? `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">${e.svg}</svg>`)}`
        : '';
      return `
        <div class="flex gap-2 bg-gray-50 border border-black p-2">
          ${imgSrc ? `<img src="${imgSrc}" alt="Ryan then" class="w-12 h-[58px] pixelated border border-black bg-white" style="image-rendering:pixelated" loading="lazy">` : '<div class="w-12 h-[58px] bg-gray-300 border border-black flex items-center justify-center text-lg">🕹️</div>'}
          <div class="flex-1">
            <div class="text-[8px] font-bold text-gray-800">${meta.icon} ${e.label || meta.label} <span class="opacity-50 font-normal">· ${e.at}</span></div>
            <div class="text-[7px] text-gray-500 mt-0.5">${change}</div>
            <div class="text-[7px] text-gray-600 mt-0.5">${e.tierName} · ❤️${e.stats.happy}% 🍕${e.stats.hunger}% ⚡${e.stats.energy}% · ${e.coins}c</div>
            ${e.note ? `<div class="text-[7px] text-purple-600 italic">${e.note}</div>` : ''}
          </div>
        </div>`;
    })
    .join('');
}