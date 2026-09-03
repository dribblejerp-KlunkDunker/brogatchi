// HUD updates: clock, stat bars, XP, chips, clutter floor.

import { xpToNext } from '../core/evolution.js';
import { FORME_INFO } from '../core/evolution.js';

export const $ = (id) => document.getElementById(id);

export function updateClock() {
  const d = new Date();
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const el = $('clock-time');
  if (el) el.innerText = `${h}:${String(d.getMinutes()).padStart(2, '0')} ${ampm}`;
}

export function updateHud(state) {
  const bar = (id, v) => {
    const el = $(id);
    if (el) el.style.width = `${Math.max(0, Math.min(100, v))}%`;
  };
  bar('bar-happy', state.stats.happy);
  bar('bar-hunger', state.stats.hunger);
  bar('bar-energy', state.stats.energy);
  bar('bar-greed', state.personality.greed);

  const coins = $('coin-count');
  if (coins) coins.innerText = String(state.coins);
  const steps = $('step-count');
  if (steps) steps.innerText = String(state.steps);

  const lvl = $('lvl-chip');
  if (lvl) {
    const formeTag = state.forme ? ` · ${FORME_INFO[state.forme].label}` : '';
    lvl.innerText = `LV ${state.level}${state.forme ? ' ⚡' : ''}`;
    lvl.title = `Level ${state.level}${formeTag}`;
  }
  const xp = $('xp-fill');
  const xpNum = $('xp-num');
  if (xp) {
    const need = xpToNext(state.level);
    const pct = state.level >= 10 ? 100 : Math.min(100, (state.xp / need) * 100);
    xp.style.width = `${pct}%`;
    if (xpNum) xpNum.innerText = state.level >= 10 ? 'MAX' : `${state.xp}/${need}`;
  }
}

export function setPedometerVisual(on) {
  const btn = $('pedometer-btn');
  if (!btn) return;
  btn.classList.toggle('animate-pulse', on);
  btn.classList.toggle('bg-green-200', on);
}

export function updateMiner(state) {
  const el = $('miner-element');
  if (el) el.style.display = state.inventory.miner ? 'block' : 'none';
}

export function renderClutter(state) {
  const c = $('room-clutter');
  if (!c) return;
  c.innerHTML = '';
  for (let i = 0; i < state.poop; i++) {
    c.innerHTML += `<div class="absolute bottom-1 text-xl drop-shadow" style="left:${15 + i * 15}%">💩</div>`;
  }
  state.clutter.forEach((item) => {
    c.innerHTML += `<div class="absolute bottom-0 text-lg opacity-80" style="left:${item.x}%">${item.type}</div>`;
  });
}

export function setDialogue(text) {
  const el = $('dialogue-text');
  if (el) el.innerHTML = text;
}

let _captionTimer = null;
const FADE_DURATION = 250; // ms — brief, no layout shift

export function updateAmbientCaption(name) {
  const el = $('ambient-caption');
  if (!el) return;
  clearTimeout(_captionTimer);
  _captionTimer = setTimeout(function () {
    el.textContent = '\u266a ' + name;
    el.classList.remove('caption-ghost');
    el.classList.add('pulse-once');
    setTimeout(function () { el.classList.remove('pulse-once'); }, 1800);
  }, FADE_DURATION);
  el.classList.add('caption-ghost');
}

export function hideAmbientCaption() {
  const el = $('ambient-caption');
  if (!el) return;
  clearTimeout(_captionTimer);
  el.classList.add('caption-ghost');
}

export function showAmbientCaption(name) {
  updateAmbientCaption(name);
}

// Weather badge in the status strip — icon + temperature.
// Called with the proxy's { condition, temp } after every poll.
const WEATHER_ICONS = {
  'clear sky': '\u2600\uFE0F',
  'mostly clear': '\uD83C\uDF24\uFE0F',
  'partly cloudy': '\u26C5',
  'overcast': '\u2601\uFE0F',
  'foggy': '\uD83C\uDF2B\uFE0F',
  'rime fog': '\uD83C\uDF2B\uFE0F',
};

function weatherIcon(condition) {
  if (!condition) return '';
  const c = condition.toLowerCase();
  if (WEATHER_ICONS[c]) return WEATHER_ICONS[c];
  if (c.includes('drizzle') || c.includes('shower')) return '\uD83C\uDF26\uFE0F';
  if (c.includes('rain')) return '\uD83C\uDF27\uFE0F';
  if (c.includes('snow')) return '\uD83C\uDF28\uFE0F';
  if (c.includes('thunder')) return '\u26C8\uFE0F';
  return '';
}

export function updateWeatherBadge(state) {
  const el = $('weather-badge');
  if (!el) return;
  if (!state || !state.condition) {
    el.textContent = '';
    return;
  }
  const icon = weatherIcon(state.condition);
  const temp = state.temp != null ? `${Math.round(state.temp)}\u00B0` : '';
  el.textContent = [icon, temp].filter(Boolean).join(' ');
  el.title = state.condition || '';
}