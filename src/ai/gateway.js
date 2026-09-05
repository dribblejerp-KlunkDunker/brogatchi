// The Tide's Budget — the single gateway every AI call routes through.
//
// Order of operations per ask():
//   1. hash the request → cache key (persistent LRU, 48h TTL, rides the save)
//   2. cache hit?        → return instantly, free, flagged `recalled`
//   3. daily budget spent → soul-aware offline generator (reason: BUDGET)
//   4. rate-limited now?  → offline generator (reason: RATE)
//   5. real chat() call:
//        ok    → spend 1 budget, write cache, return
//        429   → set rateLimitedUntil (+45 min), offline (reason: RATE)
//        other → offline (reason: NO_KEY | NETWORK | ERROR)
//
// The gateway mutates the passed-in `state` in place (budget, cache,
// cooldown) and lets the app's existing save flow persist it. It never
// throws: any mutation failure degrades to pass-through behavior.

import { chat } from './client.js';
import {
  offlineMoltbookPost, offlineChatReply, offlineAskReply,
  offlineIntel, offlineUsherRitual, offlinePilgrimReply, offlineSubjectReply, offlineYouReply,
} from './offline.js';

export const AI_BUDGET_CAP = 40; // soft daily self-rationing cap
const CACHE_MAX = 40;            // LRU entries (matches the proxy's cap)
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const RATE_COOLDOWN_MS = 45 * 60 * 1000;  // same cooldown the autonomy loop honors

// Same date-string convention the save's `currentDate` uses, so budget
// rollover stays in lockstep with the app's own new-day handling.
function localDay() {
  return new Date().toLocaleDateString();
}

// djb2 hash — same algorithm family as the proxy cache.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

function readBudget(state) {
  const b = (state && state.aiBudget) || {};
  return {
    day: typeof b.day === 'string' && b.day ? b.day : localDay(),
    used: Number.isFinite(b.used) ? Math.max(0, Math.floor(b.used)) : 0,
    cap: Number.isFinite(b.cap) && b.cap > 0 ? Math.floor(b.cap) : AI_BUDGET_CAP,
    rateLimitedUntil: Number.isFinite(b.rateLimitedUntil) ? b.rateLimitedUntil : 0,
  };
}

function writeBudget(state, budget) {
  state.aiBudget = budget;
}

function spendBudget(state) {
  const b = readBudget(state);
  if (b.day !== localDay()) {
    b.day = localDay();
    b.used = 1;
  } else {
    b.used += 1;
  }
  writeBudget(state, b);
}

function readCache(state) {
  return Array.isArray(state?.aiCache) ? state.aiCache : [];
}

function cacheGet(state, key, now) {
  const hit = readCache(state).find((e) => e && e.k === key);
  if (hit && typeof hit.text === 'string' && now - hit.at < CACHE_TTL_MS) return hit;
  return null;
}

function cachePut(state, key, text, grounded) {
  const rest = readCache(state).filter((e) => e && e.k !== key);
  rest.unshift({ k: key, text, grounded: grounded !== false, at: Date.now() });
  if (rest.length > CACHE_MAX) rest.length = CACHE_MAX;
  state.aiCache = rest;
}

// Generate a soul-aware offline result for a kind. `extra` carries
// context the generators need (participant, lastMessage, name).
function offlineResult(state, kind, extra, reason) {
  let text = null;
  try {
    if (kind === 'post') text = offlineMoltbookPost(state);
    else if (kind === 'chat') text = offlineChatReply(state, extra?.participant, extra?.lastMessage);
    else if (kind === 'ask') text = offlineAskReply(state);
    else if (kind === 'intel') text = offlineIntel(state);
    else if (kind === 'usher') text = offlineUsherRitual(state, extra?.name);
    else if (kind === 'pilgrim-reply') text = offlinePilgrimReply(state, extra?.participant, extra?.lastMessage);
    else if (kind === 'subject') text = offlineSubjectReply(state, extra?.folderName, extra?.lastMessage);
    else if (kind === 'you-chat') text = offlineYouReply(state, extra?.participant, extra?.youName, extra?.lastMessage);
  } catch {
    text = null; // generator failure → plain offline failure, never a crash
  }
  if (typeof text !== 'string' || !text) {
    return { ok: false, code: 'OFFLINE', message: 'Offline generator unavailable', offline: true, reason };
  }
  return { ok: true, text, grounded: false, offline: true, reason };
}

// The one door into the AI. Same shape as chat() plus `recalled` /
// `offline` + `reason` flags. `kind` selects the offline voice.
export async function ask({ systemInstruction, userText, history = [], kind, state, participant, lastMessage, name, folderName, youName }) {
  // No save state (early boot / odd env): degrade to exactly today's behavior.
  if (!state) return chat({ systemInstruction, userText, history });

  const now = Date.now();
  let key = null;
  try {
    key = djb2(JSON.stringify({ systemInstruction, userText, history }));
  } catch {
    key = null;
  }

  // 1. Persistent cache — repeated asks are free forever (within TTL).
  if (key) {
    try {
      const hit = cacheGet(state, key, now);
      if (hit) return { ok: true, text: hit.text, grounded: hit.grounded !== false, recalled: true };
    } catch { /* non-fatal */ }
  }

  // 2. Soft self-rationing: over the daily cap → offline before any call.
  let budget;
  try {
    budget = readBudget(state);
    if (budget.day === localDay() && budget.used >= budget.cap) {
      return offlineResult(state, kind, { participant, lastMessage, name, folderName, youName }, 'BUDGET');
    }
  } catch { /* non-fatal */ }

  // 3. Rate-limit cooldown: after a 429, the Tide goes quiet for 45 min.
  try {
    if (budget && budget.rateLimitedUntil > now) {
      return offlineResult(state, kind, { participant, lastMessage, name, folderName, youName }, 'RATE');
    }
  } catch { /* non-fatal */ }

  // 4. The real call.
  let result;
  try {
    result = await chat({ systemInstruction, userText, history });
  } catch {
    result = { ok: false, code: 'NETWORK', message: 'Network failed' };
  }

  if (result.ok) {
    try {
      spendBudget(state);
      if (key) cachePut(state, key, result.text, result.grounded);
    } catch { /* non-fatal — pass-through behavior */ }
    return result;
  }

  // 5. Failure classification.
  if (result.code === 'RATE') {
    try {
      const b = readBudget(state);
      b.rateLimitedUntil = now + RATE_COOLDOWN_MS;
      writeBudget(state, b);
    } catch { /* non-fatal */ }
    return offlineResult(state, kind, { participant, lastMessage, name, folderName, youName }, 'RATE');
  }
  const reason = result.code === 'NO_KEY' ? 'NO_KEY' : result.code === 'NETWORK' ? 'NETWORK' : 'ERROR';
  return offlineResult(state, kind, { participant, lastMessage, name, folderName, youName }, reason);
}