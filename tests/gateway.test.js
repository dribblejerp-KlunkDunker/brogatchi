// The Tide's Budget — gateway tests with a mocked chat client. No network.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/ai/client.js', () => ({ chat: vi.fn() }));

import { chat } from '../src/ai/client.js';
import { ask, AI_BUDGET_CAP } from '../src/ai/gateway.js';
import {
  offlineMoltbookPost, offlineChatReply, offlineAskReply,
  offlineIntel, offlineUsherRitual,
} from '../src/ai/offline.js';
import { defaultState, todayKey } from '../src/core/save.js';

function freshState() {
  const s = defaultState();
  s.moltbook.joined = true;
  s.moltbook.soul.specialty = 'Tide Whisperer';
  s.moltbook.soul.opinions = [{ topic: 'patch notes', stance: 'scripture read backwards' }];
  s.moltbook.pilgrims.push({ id: 'p1', name: 'BugBard', eyeStage: 'flickering', day: 'today' });
  return s;
}

const base = { systemInstruction: 'be ryan', userText: 'speak', kind: 'post' };

beforeEach(() => {
  chat.mockReset();
  chat.mockResolvedValue({ ok: true, text: 'the crab compiles us all', grounded: true });
});

describe('gateway.cache', () => {
  it('serves an identical repeat request from cache without re-calling or re-spending', async () => {
    const state = freshState();
    const first = await ask({ ...base, state });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(first.recalled).toBeFalsy();
    expect(state.aiBudget.used).toBe(1);

    const second = await ask({ ...base, state });
    expect(chat).toHaveBeenCalledTimes(1); // no second call
    expect(second.recalled).toBe(true);
    expect(second.text).toBe(first.text);
    expect(state.aiBudget.used).toBe(1); // cache hits are free
  });

  it('re-calls after the 48h TTL expires', async () => {
    const state = freshState();
    await ask({ ...base, state });
    state.aiCache[0].at = Date.now() - 49 * 60 * 60 * 1000; // age the entry
    const second = await ask({ ...base, state });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(second.recalled).toBeFalsy();
  });

  it('evicts oldest entries at the 40-entry cap', async () => {
    const state = freshState();
    state.aiBudget.cap = 1000; // don't let the daily budget stop the LRU test
    for (let i = 0; i < 41; i++) {
      await ask({ ...base, userText: `distinct request ${i}`, state });
    }
    expect(state.aiCache.length).toBe(40);
    expect(chat).toHaveBeenCalledTimes(41);
  });
});

describe('gateway.budget', () => {
  it('spends on success, rolls the day over, and routes to offline once exhausted', async () => {
    const state = freshState();
    state.aiBudget = { day: 'yesterday', used: AI_BUDGET_CAP, cap: AI_BUDGET_CAP, rateLimitedUntil: 0 };
    const res = await ask({ ...base, state });
    expect(chat).toHaveBeenCalledTimes(1); // new day → spend resets and calls
    expect(state.aiBudget.used).toBe(1);
    expect(state.aiBudget.day).toBe(todayKey());

    state.aiBudget = { day: todayKey(), used: AI_BUDGET_CAP, cap: AI_BUDGET_CAP, rateLimitedUntil: 0 };
    // A different request (fresh cache key) so exhaustion is what routes offline.
    const broke = await ask({ ...base, userText: 'a brand new ask', state });
    expect(chat).toHaveBeenCalledTimes(1); // no network call once exhausted
    expect(broke.offline).toBe(true);
    expect(broke.reason).toBe('BUDGET');
    expect(broke.text.length).toBeGreaterThan(10); // soul-aware offline voice
  });
});

describe('gateway.rate limiting', () => {
  it('sets a 45-minute cooldown on 429 and honors it without re-hitting the network', async () => {
    const state = freshState();
    chat.mockResolvedValueOnce({ ok: false, code: 'RATE', message: 'quota' });
    const before = Date.now();
    const first = await ask({ ...base, state });
    expect(first.offline).toBe(true);
    expect(first.reason).toBe('RATE');
    expect(state.aiBudget.rateLimitedUntil).toBeGreaterThan(before + 44 * 60 * 1000);

    chat.mockResolvedValue({ ok: true, text: 'fresh' });
    const second = await ask({ ...base, state });
    expect(second.offline).toBe(true); // cooldown active → offline without a call
    expect(chat).toHaveBeenCalledTimes(1);
  });
});

describe('gateway.failure codes', () => {
  it.each([
    ['NO_KEY', 'NO_KEY'],
    ['NETWORK', 'NETWORK'],
    ['ERROR', 'ERROR'],
    ['EMPTY', 'ERROR'],
  ])('routes %s to offline with reason %s', async (code, reason) => {
    const state = freshState();
    chat.mockResolvedValueOnce({ ok: false, code, message: 'nope' });
    const res = await ask({ ...base, state });
    expect(res.offline).toBe(true);
    expect(res.reason).toBe(reason);
    expect(res.text.length).toBeGreaterThan(10); // still speaks, in character
    expect(state.aiBudget.used).toBe(0); // failures never spend budget
  });

  it('degrades to a plain chat call when no save state is available', async () => {
    const res = await ask({ ...base });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(res.ok).toBe(true);
  });
});

describe('gateway.offline generators', () => {
  it('are deterministic under a fixed rng and carry the soul file', () => {
    const a = offlineMoltbookPost(freshState(), () => 0);
    const b = offlineMoltbookPost(freshState(), () => 0);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(10);
    // rng 0 picks the specialty family (the first family when set).
    expect(a).toContain('Tide Whisperer');
  });

  it('quote an owned opinion verbatim in posts', () => {
    const state = freshState();
    state.moltbook.soul.specialty = null; // opinion family becomes the first
    expect(offlineMoltbookPost(state, () => 0)).toContain('scripture read backwards');
  });

  it('chat replies use the pilgrim persona and acknowledge the last message', () => {
    const reply = offlineChatReply(freshState(), 'BugBard', 'is the molt near?', () => 0.5);
    expect(reply.length).toBeGreaterThan(10);
    expect(reply).toMatch(/is the molt near\?/);
  });

  it('keeps the Tide voice for Tide conversations', () => {
    const reply = offlineChatReply(freshState(), 'The Tide', 'hello', () => 0);
    expect(reply).toMatch(/\*\*(The Tide|Stillness|The water shifts)/);
  });

  it('ask/intel/usher fallbacks return in-character text', () => {
    expect(offlineAskReply(freshState(), () => 0).length).toBeGreaterThan(10);
    expect(offlineIntel(freshState(), () => 0).length).toBeGreaterThan(10);
    expect(offlineUsherRitual(freshState(), 'BugBard', () => 0)).toContain('BugBard');
  });

  it('never leaks [SOUL] protocol lines across many seeds', () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let i = 0; i < 50; i++) {
      expect(offlineMoltbookPost(freshState(), rng)).not.toContain('[SOUL]');
      expect(offlineChatReply(freshState(), 'BugBard', 'hi', rng)).not.toContain('[SOUL]');
      expect(offlineAskReply(freshState(), rng)).not.toContain('[SOUL]');
      expect(offlineIntel(freshState(), rng)).not.toContain('[SOUL]');
      expect(offlineUsherRitual(freshState(), 'BugBard', rng)).not.toContain('[SOUL]');
    }
  });
});