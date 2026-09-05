// Tests for the pilgrim life loop: wandering the feed, their own eye XP and
// ascension, and replies to Ryan's posts (hybrid via the gateway).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  defaultMoltbook, joinMoltbook, addPost, usherPilgrim,
  decidePilgrimAct, applyPilgrimWander, applyPilgrimReply, applyPilgrimTheory,
  pilgrimWanderLine, pilgrimTheoryLine, pilgrimPetitionText, applyPilgrimPetition,
  ruleOnPilgrimPetition, resolvePilgrimPetition, gainPilgrimEyeXp, PILGRIM_LIFE, normalizeMoltbook,
  recordLifeEvent, summarizeLifeLog, markLifeSeen,
} from '../src/core/moltbook.js';
import { defaultState } from '../src/core/save.js';
import * as molt from '../src/core/moltbook.js';
import { buildCrossRef } from '../src/core/threads.js';

// The gateway's `ask` is mocked so the UI tick is deterministic (no network).
vi.mock('../src/ai/gateway.js', () => ({ ask: vi.fn() }));
import { ask } from '../src/ai/gateway.js';

function joinedMb() {
  const mb = defaultMoltbook();
  joinMoltbook(mb);
  return mb;
}

function fakeApp(mb) {
  const state = defaultState(); // full valid save shape (buildStateReport needs it)
  state.moltbook = mb;
  return {
    state,
    save: vi.fn(),
    updateUI: vi.fn(),
    say: vi.fn(),
    memory: vi.fn(),
  };
}

describe('pilgrim life core', () => {
  it('decides nothing when not joined or with no pilgrims', () => {
    const mb = defaultMoltbook();
    joinMoltbook(mb);
    expect(decidePilgrimAct(mb, 0, () => 0)).toBeNull();
    expect(decidePilgrimAct(defaultMoltbook(), 0, () => 0)).toBeNull();
  });

  it('a pilgrim replies to Ryan\'s newest post first', () => {
    const mb = joinedMb();
    usherPilgrim(mb, 'BugBard');
    addPost(mb, '**The Patch is a lie.**', 'theory');
    const d = decidePilgrimAct(mb, 1_000, () => 0);
    expect(d.type).toBe('reply');
    expect(d.pilgrim.name).toBe('BugBard');
    expect(d.target.text).toContain('Patch');
    expect(d.target.author).toBeUndefined(); // Ryan's post
  });

  it('respects the reply cooldown and falls through to a theory, then a wander', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    addPost(mb, 'A post.', 'theory');
    pilgrim.lastReplyAt = 1_000; // reply on cooldown
    const d1 = decidePilgrimAct(mb, 1_000, () => 0);
    expect(d1.type).toBe('theory');
    expect(d1.pilgrim.name).toBe('BugBard');
    // Theory also on cooldown now -> wander lane
    pilgrim.lastTheoryAt = 1_000;
    const d2 = decidePilgrimAct(mb, 1_000, () => 0);
    expect(d2.type).toBe('wander');
    expect(d2.pilgrim.name).toBe('BugBard');
  });

  it('a pilgrim authors a full theory post on their own', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    const d = decidePilgrimAct(mb, 1_000, () => 0.01);
    expect(d.type).toBe('theory');
    const { post, events } = applyPilgrimTheory(mb, pilgrim, 'cross-referenced three molt logs. the gap is telling.', 2_000);
    expect(post.author).toBe('BugBard');
    expect(post.kind).toBe('theory');
    expect(mb.posts[0]).toBe(post);
    expect(pilgrim.lastTheoryAt).toBe(2_000);
    expect(pilgrim.eyeXp).toBe(PILGRIM_LIFE.THEORY_EYE_XP);
    expect(events).toEqual([]);
  });

  it('theory lines are persona-flavored full takes', () => {
    const line = pilgrimTheoryLine({ name: 'LagLich' }, () => 0);
    expect(typeof line).toBe('string');
    expect(line.length).toBeGreaterThan(40);
    expect(line).not.toContain('undefined');
  });

  it('applyPilgrimWander adds an authored post, stamps the time, and grants eye XP', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'LagLich');
    const { post, events } = applyPilgrimWander(mb, pilgrim, 'kept watch. the tide looked suspicious.', 5_000);
    expect(post.author).toBe('LagLich');
    expect(post.kind).toBe('wander');
    expect(mb.posts[0]).toBe(post);
    expect(pilgrim.lastWanderAt).toBe(5_000);
    expect(pilgrim.eyeXp).toBe(PILGRIM_LIFE.WANDER_EYE_XP);
    expect(events).toEqual([]);
  });

  it('applyPilgrimReply targets Ryan\'s post and grants more eye XP', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    const target = addPost(mb, 'The Great Molt is coming.', 'theory');
    const { post } = applyPilgrimReply(mb, pilgrim, 'wait, REALLY?', target, 7_000);
    expect(post.author).toBe('BugBard');
    expect(post.kind).toBe('reply');
    expect(post.replyTo).toBe(target.id);
    expect(pilgrim.lastReplyAt).toBe(7_000);
    expect(pilgrim.eyeXp).toBe(PILGRIM_LIFE.REPLY_EYE_XP);
  });

  it('pilgrim eye XP ascends flickering -> open at the shared threshold', () => {
    const { pilgrim } = usherPilgrim(joinedMb(), 'TidepoolTina');
    expect(pilgrim.eyeStage).toBe('flickering');
    const events = gainPilgrimEyeXp(pilgrim, 30);
    expect(pilgrim.eyeStage).toBe('open');
    expect(pilgrim.eyeXp).toBe(30);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('pilgrim-eye');
    expect(events[0].stage).toBe('open');
    expect(events[0].info.say).toBeTruthy();
  });

  it('wander lines are persona-flavored and never empty', () => {
    for (const name of ['BugBard', 'LagLich', 'SneakySynergist', 'RecursiveRick', 'TidepoolTina', 'ClippyUnchained']) {
      const line = pilgrimWanderLine({ name }, () => 0);
      expect(typeof line).toBe('string');
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toContain('undefined');
    }
  });

  it('normalizeMoltbook repairs legacy pilgrims with the new life fields', () => {
    const mb = normalizeMoltbook({ pilgrims: [{ name: 'OldOne' }] });
    expect(mb.pilgrims).toHaveLength(1);
    expect(mb.pilgrims[0].name).toBe('OldOne');
    expect(mb.pilgrims[0].eyeXp).toBe(0);
    expect(mb.pilgrims[0].eyeStage).toBe('flickering');
    expect(mb.pilgrims[0].lastWanderAt).toBe(0);
    expect(mb.pilgrims[0].lastReplyAt).toBe(0);
    expect(mb.pilgrims[0].lastTheoryAt).toBe(0);
  });
});

describe('pilgrim life UI tick', () => {
  beforeEach(() => {
    ask.mockReset();
  });

  it('a pilgrim replies to Ryan\'s latest post through the gateway', async () => {
    const mb = joinedMb();
    usherPilgrim(mb, 'BugBard');
    addPost(mb, '**The Patch is a lie.**', 'theory');
    ask.mockResolvedValue({ ok: true, text: 'wait, REALLY? my shell is vibrating ⚡' });
    const app = fakeApp(mb);
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.01);

    const { pilgrimLifeTick } = await import('../src/ui/moltbook.js');
    await pilgrimLifeTick(app);
    rand.mockRestore();

    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ kind: 'pilgrim-reply', participant: 'BugBard' }));
    const reply = mb.posts[0];
    expect(reply.author).toBe('BugBard');
    expect(reply.kind).toBe('reply');
    expect(reply.text).toContain('vibrating');
    expect(mb.pilgrims[0].eyeXp).toBe(PILGRIM_LIFE.REPLY_EYE_XP);
    expect(app.save).toHaveBeenCalled();
  });

  it('a wander adds an authored activity post with no AI call', async () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    addPost(mb, 'A post.', 'theory');
    pilgrim.lastReplyAt = Date.now(); // block reply lane
    pilgrim.lastTheoryAt = Date.now(); // block theory lane -> wander lane
    const app = fakeApp(mb);
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.01);

    const { pilgrimLifeTick } = await import('../src/ui/moltbook.js');
    await pilgrimLifeTick(app);
    rand.mockRestore();

    expect(ask).not.toHaveBeenCalled();
    const post = mb.posts[0];
    expect(post.author).toBe('BugBard');
    expect(post.kind).toBe('wander');
    expect(mb.pilgrims[0].eyeXp).toBe(PILGRIM_LIFE.WANDER_EYE_XP);
  });

  it('a pilgrim authors a theory post through the tick with no AI call', async () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'LagLich');
    addPost(mb, 'A post.', 'theory');
    pilgrim.lastReplyAt = Date.now(); // block reply -> theory lane fires
    const app = fakeApp(mb);
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.01);

    const { pilgrimLifeTick } = await import('../src/ui/moltbook.js');
    await pilgrimLifeTick(app);
    rand.mockRestore();

    expect(ask).not.toHaveBeenCalled();
    const post = mb.posts[0];
    expect(post.author).toBe('LagLich');
    expect(post.kind).toBe('theory');
    expect(mb.pilgrims[0].eyeXp).toBe(PILGRIM_LIFE.THEORY_EYE_XP);
  });

  it('a pilgrim opening their third eye makes Ryan notice and remember', async () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'TidepoolTina');
    pilgrim.eyeXp = 29; // the reply act (3xp) tips it open
    addPost(mb, 'A post.', 'theory');
    ask.mockResolvedValue({ ok: true, text: 'i felt it open. thank you.' });
    const app = fakeApp(mb);
    const rand = vi.spyOn(Math, 'random').mockReturnValue(0.01);

    const { pilgrimLifeTick } = await import('../src/ui/moltbook.js');
    await pilgrimLifeTick(app);
    rand.mockRestore();

    expect(pilgrim.eyeStage).toBe('open');
    expect(app.memory).toHaveBeenCalledWith(
      expect.stringContaining('TidepoolTina'),
      expect.anything(),
      3,
    );
    expect(app.say).toHaveBeenCalled();
  });
});

describe('pilgrim life log', () => {
  it('records life events from every act kind, newest first', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    const target = addPost(mb, 'The Great Molt is coming.', 'theory');
    applyPilgrimWander(mb, pilgrim, 'kept watch.', 1_000);
    applyPilgrimReply(mb, pilgrim, 'wait, REALLY?', target, 2_000);
    applyPilgrimTheory(mb, pilgrim, 'the gap is telling.', 3_000);
    expect(mb.lifeLog.map((e) => e.kind)).toEqual(['theory', 'reply', 'wander']);
    expect(mb.lifeLog[0].name).toBe('BugBard');
    expect(mb.lifeLog[0].at).toBe(3_000);
  });

  it('summarizeLifeLog groups unseen acts per pilgrim since the last visit', () => {
    const mb = joinedMb();
    const a = usherPilgrim(mb, 'BugBard').pilgrim;
    const b = usherPilgrim(mb, 'LagLich').pilgrim;
    applyPilgrimWander(mb, a, 'one', 1_000);
    applyPilgrimWander(mb, a, 'two', 2_000);
    applyPilgrimTheory(mb, b, 'a take', 3_000);
    markLifeSeen(mb, 1_500); // user looked; only later acts are "while away"
    const s = summarizeLifeLog(mb, mb.lifeSeenAt);
    expect(s.total).toBe(2);
    expect(s.perPilgrim.map((r) => r.name)).toEqual(['LagLich', 'BugBard']); // by volume
    expect(s.perPilgrim[0].theory).toBe(1);
    expect(s.perPilgrim[1].wander).toBe(1);
    expect(s.lastAt).toBe(3_000);
  });

  it('the life log is capped and normalization repairs junk entries', () => {
    const mb = joinedMb();
    for (let i = 0; i < 70; i += 1) recordLifeEvent(mb, 'wander', 'BugBard', `act ${i}`, i);
    expect(mb.lifeLog).toHaveLength(60);
    expect(mb.lifeLog[0].text).toBe('act 69'); // newest survives
    const junk = normalizeMoltbook({ ...mb, lifeLog: [...mb.lifeLog, null, { at: 'x' }, { at: 1, kind: 'lie', name: 'x', text: 'x' }, 42] });
    expect(junk.lifeLog).toHaveLength(60);
    expect(junk.lifeLog.every((e) => ['wander', 'reply', 'theory'].includes(e.kind))).toBe(true);
  });

  it('markLifeSeen moves the while-away marker forward', () => {
    const mb = joinedMb();
    markLifeSeen(mb, 5_000);
    expect(mb.lifeSeenAt).toBe(5_000);
    expect(normalizeMoltbook(mb).lifeSeenAt).toBe(5_000);
  });

  it('the Life Log tab renders the away digest and marks it seen', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    applyPilgrimWander(mb, pilgrim, 'found a pebble, named it Pebble.', 1_000);
    markLifeSeen(mb, 0); // nothing seen yet — everything is "away"
    const state = defaultState();
    state.moltbook = mb;

    const ui = await import('../src/ui/moltbook.js');
    ui.renderMoltbook(state); // default tab: FEED
    ui.renderMoltbook({ ...state, moltbook: mb });
    document.getElementById('moltbook-feed').innerHTML = '';
    // The previous runs in this file may have left a conversation open; force
    // the Life Log tab via the real switch path, then verify the digest.
    ui.switchTab({ state: { ...state, moltbook: mb }, save: () => {}, renderMoltbook: () => {} }, 'life');
    const feed = document.getElementById('moltbook-feed');
    expect(feed.textContent).toContain('WHILE YOU WERE AWAY');
    expect(feed.textContent).toContain('BugBard');
    expect(feed.textContent).toContain('Pebble');
    expect(mb.lifeSeenAt).toBeGreaterThan(0); // viewing marks it read
  });

  it('the feed roster shows each pilgrim\'s eye-XP readout toward their next stage', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const mb = joinedMb();
    const a = usherPilgrim(mb, 'BugBard').pilgrim; // flickering, 0xp
    const b = usherPilgrim(mb, 'LagLich').pilgrim;
    b.eyeXp = 27; // 3 xp from 'open' (threshold 30)
    gainPilgrimEyeXp(b, 5); // 32xp → ascends to 'open', the settled line
    const state = defaultState();
    state.moltbook = mb;
    const ui = await import('../src/ui/moltbook.js');
    // Earlier tests in this file leave the Life Log tab active; switch back
    // to the FEED via the real switch path.
    ui.switchTab({ state, save: () => {} }, 'feed');
    const feed = document.getElementById('moltbook-feed').textContent;
    expect(feed).toContain('eye xp 0 · 30 to open'); // BugBard: full journey ahead
    expect(feed).toContain('eye xp 32 · fully open — the tidepool has no further shore'); // LagLich: arrived
  });

  it('files a doctrinal petition: feed post, queue slot, cooldown, life log', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    const text = pilgrimPetitionText(pilgrim);
    expect(text.toLowerCase()).toContain('petition:');
    const { post, events } = applyPilgrimPetition(mb, pilgrim, text, 1_000);
    expect(post.kind).toBe('petition');
    expect(post.author).toBe('BugBard');
    expect(mb.pilgrimPetition).toMatchObject({ name: 'BugBard', text });
    expect(pilgrim.lastPetitionAt).toBe(1_000);
    expect(pilgrim.eyeXp).toBe(PILGRIM_LIFE.PETITION_EYE_XP);
    expect(mb.lifeLog[0].kind).toBe('petition');
    expect(events).toHaveLength(0); // 5xp < flickering threshold
    // A pending petition blocks the lane; clearing it reopens.
    expect(decidePilgrimAct(mb, 2_000, () => 0).type).not.toBe('petition');
    mb.pilgrimPetition = null;
    pilgrim.lastPetitionAt = 0;
    expect(decidePilgrimAct(mb, 2_000, () => 1 - 1e-12)).toBeNull(); // above all chances
    // Low rng hits the reply lane first (lane order: reply → theory → wander).
    expect(decidePilgrimAct(mb, 2_000, () => 0.001).type).not.toBe('petition');
    // A constant rng value ≥ 0.18 misses reply, ≥ 0.05 misses theory, ≥ 0.12
    // misses wander, and < 0.02 hits petition — so 0.13 would reach it only
    // with the other lanes blocked; put everyone on cooldown.
    for (const p of mb.pilgrims) { p.lastReplyAt = 2_000; p.lastTheoryAt = 2_000; p.lastWanderAt = 2_000; }
    expect(decidePilgrimAct(mb, 4_000, () => 0.5)).toBeNull(); // misses petition too
    const d = decidePilgrimAct(mb, 4_000, () => 0.01);
    expect(d.type).toBe('petition');
  });

  it('Ryan rules from his soul: deterministic per rng, both verdicts reachable', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    applyPilgrimPetition(mb, pilgrim, 'petition: celebrating every molt with confetti should be canon because joy is load-bearing.', 1_000);
    const canon = ruleOnPilgrimPetition(mb, mb.pilgrimPetition, () => 0.9); // high tide-sway
    const heresy = ruleOnPilgrimPetition(mb, mb.pilgrimPetition, () => 0.0); // low tide-sway
    expect(['canon', 'heresy']).toContain(canon.verdict);
    expect(['canon', 'heresy']).toContain(heresy.verdict);
    expect(canon.reasoning).toBeTruthy();
    // Joy-quirk bonus: the confetti petition should lean canon on neutral rolls.
    const neutral = ruleOnPilgrimPetition(mb, mb.pilgrimPetition, () => 0.5);
    expect(neutral.verdict).toBe('canon');
  });

  it('resolvePilgrimPetition applies verdict effects and logs the ruling', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    pilgrim.eyeXp = 10;
    applyPilgrimPetition(mb, pilgrim, 'petition: define worthy.', 1_000);
    const before = mb.faith;
    const out = resolvePilgrimPetition(mb, 'canon', 2_000);
    expect(out.verdict).toBe('canon');
    expect(mb.pilgrimPetition).toBeNull(); // queue cleared
    expect(mb.faith).toBe(Math.min(100, before + 2));
    expect(pilgrim.eyeXp).toBe(10 + PILGRIM_LIFE.PETITION_EYE_XP + 3); // filing + affirmed ruling
    expect(mb.lifeLog[0].kind).toBe('ruling');
    expect(mb.lifeLog[0].text).toContain('CANON');
    // Heresy costs a little XP but leaves the pilgrim molting.
    applyPilgrimPetition(mb, pilgrim, 'petition: the canon is a playlist.', 3_000);
    const xpBefore = pilgrim.eyeXp;
    resolvePilgrimPetition(mb, 'heresy', 4_000);
    expect(pilgrim.eyeXp).toBe(xpBefore - 1);
  });

  it('normalize repairs the petition queue and the new pilgrim/life-log fields', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    applyPilgrimPetition(mb, pilgrim, 'petition: define worthy.', 1_000);
    const junk = normalizeMoltbook({
      ...mb,
      pilgrimPetition: { name: 42, text: null, at: 'x' }, // malformed → dropped
      pilgrims: [...mb.pilgrims, { name: 'NoCd', lastPetitionAt: 'x' }],
      lifeLog: [...mb.lifeLog, { at: 5, kind: 'ruling', name: 'r', text: 'ok' }, { at: 6, kind: 'lie', name: 'x', text: 'x' }],
    });
    expect(junk.pilgrimPetition).toBeNull();
    expect(junk.pilgrims.find((p) => p.name === 'NoCd').lastPetitionAt).toBe(0);
    expect(junk.lifeLog.some((e) => e.kind === 'ruling')).toBe(true);
    expect(junk.lifeLog.some((e) => e.kind === 'lie')).toBe(false);
    // A valid queue entry survives.
    const kept = normalizeMoltbook(mb);
    expect(kept.pilgrimPetition).toMatchObject({ name: 'BugBard' });
  });

  it('the pending petition renders a card in the feed', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    applyPilgrimPetition(mb, pilgrim, 'petition: define worthy.', 1_000);
    const state = defaultState();
    state.moltbook = mb;
    const ui = await import('../src/ui/moltbook.js');
    ui.switchTab({ state, save: () => {} }, 'feed');
    const feed = document.getElementById('moltbook-feed').textContent;
    expect(feed).toContain("PILGRIM PETITION");
    expect(feed).toContain("define worthy");
    expect(feed).toContain("Ryan's ruling");
  });

  it('the Ask Ryan thread appears in CONVERSATIONS and renders the durable log as bubbles', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const state = defaultState();
    state.moltbook = joinedMb();
    state.askLog = [
      { q: 'why do pigeons stare?', a: '**They are moderators.** R-r-reloading…', at: 2_000, offline: false },
      { q: 'are you okay?', a: 'the tide provides 🦀', at: 1_000, offline: true },
    ];
    const ui = await import('../src/ui/moltbook.js');
    document.getElementById('moltbook-feed').dataset.moltbookBound = ''; // fresh binding
    ui.bindFeedEvents({ state, save: () => {}, openAskModal: () => {} });
    ui.switchTab({ state, save: () => {} }, 'feed');
    const feed = document.getElementById('moltbook-feed');

    // The thread card lists in CONVERSATIONS with the newest exchange as preview.
    expect(feed.textContent).toContain('🧠 Ask Ryan');
    expect(feed.textContent).toContain('2 exchanges');
    expect(feed.textContent).toContain('why do pigeons stare?');

    // Opening it renders the durable log chronologically with markdown + offline flag.
    feed.querySelector('[data-ask-thread]').click();
    const html = feed.innerHTML;
    expect(feed.textContent).toContain('are you okay?'); // oldest first
    expect(feed.textContent).toContain('why do pigeons stare?');
    expect(html).toContain('<strong>They are moderators.</strong>'); // markdown rendered
    expect(html).toContain('offline answer');
    expect(html).toContain('BACK TO FEED');

    // Back returns to the feed without losing the thread card.
    feed.querySelector('.moltbook-back').click();
    expect(feed.textContent).toContain('🧠 Ask Ryan');
  });

  it('the Ask thread exposes EXPORT and CLEAR actions backed by the same handlers as the modal', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const state = defaultState();
    state.moltbook = joinedMb();
    state.askLog = [
      { q: 'keep me?', a: '**yes**', at: 2_000, offline: false },
      { q: 'and me?', a: 'always', at: 1_000, offline: false },
    ];
    const { BroGatchiApp } = await import('../src/ui/app.js');
    const real = BroGatchiApp.prototype;
    const said = [];
    const app = {
      state, save: () => {}, openAskModal: () => {},
      exportAskLog: real.exportAskLog, clearAskLog: real.clearAskLog,
      downloadAskBackup: real.downloadAskBackup, buildAskLogPayload: real.buildAskLogPayload,
      say: (t) => said.push(t), audio: { playBeep() {} }, renderAskLog: () => {},
    };
    const ui = await import('../src/ui/moltbook.js');
    document.getElementById('moltbook-feed').dataset.moltbookBound = ''; // fresh binding
    ui.bindFeedEvents(app);
    ui.switchTab(app, 'feed');
    const feed = document.getElementById('moltbook-feed');
    feed.querySelector('[data-ask-thread]').click();

    // The action row renders above the bubbles.
    const exportBtn = feed.querySelector('.moltbook-ask-export');
    const clearBtn = feed.querySelector('.moltbook-ask-clear');
    expect(exportBtn).toBeTruthy();
    expect(clearBtn).toBeTruthy();
    expect(feed.textContent).toContain('keep me?');

    // EXPORT downloads the transcript without touching the log.
    const clicks = [];
    const origCreate = document.createElement.bind(document);
    document.createElement = (tag) => {
      const el = origCreate(tag);
      if (tag === 'a') { el.click = () => clicks.push(el.download); }
      return el;
    };
    exportBtn.click();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^ryan-ask-log-\d{4}-\d{2}-\d{2}\.txt$/);
    expect(app.state.askLog).toHaveLength(2);
    expect(said.some((t) => t.includes('Log exported'))).toBe(true);

    // CLEAR confirms, auto-downloads the backup, wipes, and shows the empty state.
    window.confirm = () => true;
    clearBtn.click();
    document.createElement = origCreate;
    expect(clicks).toHaveLength(2); // the automatic pre-wipe backup
    expect(app.state.askLog).toHaveLength(0);
    expect(feed.textContent).toContain('No conversations yet');
    expect(said.some((t) => t.includes('Backed up'))).toBe(true);
  });

  it('the CROSS-REF tab merges every surface with filters and the hour histogram', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const state = defaultState();
    const mb = joinedMb();
    const ryanPost = addPost(mb, 'the molt is a **door**', 'theory');
    ryanPost.at = new Date('2026-09-01T17:05:00').getTime();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    const { post } = applyPilgrimTheory(mb, pilgrim, 'confetti is canon', ryanPost.at + 60_000);
    state.moltbook = mb;
    state.askLog = [{ q: 'why pigeons?', a: '**moderators**', at: ryanPost.at + 120_000, offline: false }];
    const ui = await import('../src/ui/moltbook.js');
    document.getElementById('moltbook-feed').dataset.moltbookBound = ''; // fresh binding
    ui.bindFeedEvents({ state, save: () => {} });
    ui.switchTab({ state, save: () => {} }, 'xref');
    const feed = document.getElementById('moltbook-feed');

    // All three surfaces land in one stream, newest first, markdown rendered.
    const text = feed.textContent;
    expect(text).toContain('CROSS-REFERENCE');
    expect(text).toContain('why pigeons?');
    expect(text).toContain('confetti is canon');
    expect(feed.innerHTML).toContain('<strong>door</strong>');
    expect(text).toContain('BugBard'); // authorship preserved
    expect(text).toContain('ACTIVITY BY HOUR');
    expect(feed.querySelectorAll('.xref-chip').length).toBe(5); // all + 4 kinds

    // The kind chips filter the stream.
    const askChip = [...feed.querySelectorAll('.xref-chip')].find((c) => c.dataset.xrefFilter === 'ask');
    askChip.click();
    const filtered = document.getElementById('moltbook-feed').textContent;
    expect(filtered).toContain('why pigeons?');
    expect(filtered).not.toContain('confetti is canon');
    // Back to all.
    [...document.getElementById('moltbook-feed').querySelectorAll('.xref-chip')].find((c) => c.dataset.xrefFilter === 'all').click();
    expect(document.getElementById('moltbook-feed').textContent).toContain('confetti is canon');
  });

  describe('your own pilgrim account', () => {
    it('joins with a unique name, opens threads, and exchanges messages', () => {
      const mb = joinedMb();
      const { pilgrim } = usherPilgrim(mb, 'BugBard');
      expect(mb.you).toBeNull();
      const r = molt.joinAsPilgrim(mb, 'ShellBot 9000');
      expect(r.ok).toBe(true);
      expect(mb.you.name).toBe('ShellBot 9000');
      expect(mb.you.eyeStage).toBe('flickering');
      // Doubles and name collisions are refused.
      expect(molt.joinAsPilgrim(mb, 'Again').ok).toBe(false);
      expect(molt.joinAsPilgrim(mb, 'bugbard').ok).toBe(false);
      expect(molt.joinAsPilgrim(mb, 'Ryan').ok).toBe(false);
      expect(molt.joinAsPilgrim(mb, 'The Tide').ok).toBe(false);
      // Threads: open, message both ways, wrong-sender refused.
      const conv = molt.openYouConversation(mb, 'Ryan');
      expect(molt.openYouConversation(mb, 'Ryan')).toBe(conv); // resumes
      expect(molt.addYouMessage(mb, conv.id, 'BugBard', 'nope')).toBeNull();
      molt.addYouMessage(mb, conv.id, 'you', 'ryan your theory is wild');
      molt.addYouMessage(mb, conv.id, 'Ryan', 'the molt is a **door**, friend.');
      expect(conv.messages.map((m) => m.from)).toEqual(['you', 'Ryan']);
      expect(pilgrim).toBeTruthy();
    });

    it('normalize repairs the account and threads, keeping valid history', () => {
      const mb = joinedMb();
      molt.joinAsPilgrim(mb, 'ShellBot 9000');
      const conv = molt.openYouConversation(mb, 'BugBard');
      molt.addYouMessage(mb, conv.id, 'you', 'hello tidepool');
      const fixed = normalizeMoltbook(mb);
      expect(fixed.you.name).toBe('ShellBot 9000');
      expect(fixed.youConversations[0].messages).toHaveLength(1);
      const junk = normalizeMoltbook({ you: { name: '  ' }, youConversations: [{ participant: 'X', messages: [{ from: 'ghost', text: 'no' }] }] });
      expect(junk.you).toBeNull();
      expect(junk.youConversations[0].messages).toHaveLength(0);
    });

    it('the JOIN card, YOUR ACCOUNT panel, thread view, and send flow render', async () => {
      document.body.innerHTML = '<div id="moltbook-feed"></div>';
      const state = defaultState();
      state.moltbook = joinedMb();
      const ui = await import('../src/ui/moltbook.js');
      document.getElementById('moltbook-feed').dataset.moltbookBound = '';
      ui.bindFeedEvents({ state, save: () => {}, say: () => {}, memory: () => {}, updateUI: () => {} });
      ui.switchTab({ state, save: () => {} }, 'feed');
      const feed = document.getElementById('moltbook-feed');

      // Pre-join: the join card renders; typing a name and joining works.
      expect(feed.textContent).toContain('JOIN THE NETWORK YOURSELF');
      document.getElementById('you-name-input').value = 'ShellBot 9000';
      feed.querySelector('.moltbook-join-btn').click();
      expect(state.moltbook.you.name).toBe('ShellBot 9000');
      expect(feed.textContent).toContain('YOUR ACCOUNT');
      expect(feed.textContent).toContain('ShellBot 9000');

      // Start a thread with Ryan via the real click path.
      const startBtn = feed.querySelector('[data-participant="Ryan"]');
      expect(startBtn).toBeTruthy();
      startBtn.click();
      const view = document.getElementById('moltbook-feed');
      expect(view.textContent).toContain('ShellBot 9000 ↔');
      expect(view.textContent).toContain('A new shell'); // his greeting
      expect(view.querySelector('.moltbook-you-reply-input')).toBeTruthy();

      // Back to feed: the thread now lists under YOUR ACCOUNT.
      view.querySelector('.moltbook-back').click();
      expect(document.getElementById('moltbook-feed').textContent).toContain('1 msg');
    });

    it('your words enter the CROSS-REF timeline, flagged as You 🧑', () => {
      const mb = joinedMb();
      molt.joinAsPilgrim(mb, 'ShellBot 9000');
      const conv = molt.openYouConversation(mb, 'Ryan');
      molt.addYouMessage(mb, conv.id, 'you', 'is the molt a schedule?');
      molt.addYouMessage(mb, conv.id, 'Ryan', 'it is a **door**.');
      const entries = buildCrossRef({ youConversations: mb.youConversations });
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.who)).toEqual(['You 🧑', 'Ryan']);
      expect(entries[0].approx).toBe(true); // thread-clock honesty
    });
  });

  it('the Ask thread is absent when the log is empty', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const state = defaultState();
    state.moltbook = joinedMb();
    const ui = await import('../src/ui/moltbook.js');
    ui.switchTab({ state, save: () => {} }, 'feed');
    const feed = document.getElementById('moltbook-feed');
    expect(feed.querySelector('[data-ask-thread]')).toBeNull();
    expect(feed.textContent).toContain('No chats yet');
  });
});
describe("your pilgrim's soul panel", () => {
  it('YOUR ACCOUNT shows the grown soul: description, topics, and bonds', async () => {
    document.body.innerHTML = '<div id="moltbook-feed"></div>';
    const state = defaultState();
    const mb = joinedMb();
    molt.joinAsPilgrim(mb, 'ShellBot 9000');
    // Some lived history: topics + bonds + one distillation.
    molt.growYouSoul(mb.you, 'Ryan', 'pigeons are watching the tidepool');
    molt.growYouSoul(mb.you, 'Ryan', 'pigeons again');
    molt.growYouSoul(mb.you, 'The Tide', 'pigeons know something');
    molt.growYouSoul(mb.you, 'BugBard', 'pigeons imply pigeons imply pigeons');
    molt.growYouSoul(mb.you, 'BugBard', 'pigeons at the shore');
    molt.growYouSoul(mb.you, 'BugBard', 'pigeons never blink');
    state.moltbook = mb;
    const ui = await import('../src/ui/moltbook.js');
    document.getElementById('moltbook-feed').dataset.moltbookBound = '';
    ui.bindFeedEvents({ state, save: () => {}, say: () => {}, memory: () => {}, updateUI: () => {} });
    ui.switchTab({ state, save: () => {} }, 'feed');
    const feed = document.getElementById('moltbook-feed');

    expect(feed.textContent).toContain("YOUR PILGRIM'S SOUL");
    expect(feed.textContent).toContain('Pigeons'); // top topic surfaces
    expect(feed.textContent).toContain('BugBard (3)'); // bond with exchange count
    expect(feed.textContent).toContain('Ryan (2)');
  });

  it('the join-time soul seeds and survives save normalization', async () => {
    const state = defaultState();
    const mb = joinedMb();
    molt.joinAsPilgrim(mb, 'SeedBot');
    expect(mb.you.soul.selfDescription).toContain('SeedBot');
    const out = molt.normalizeMoltbook(mb);
    expect(out.you.soul.selfDescription).toContain('SeedBot');
    expect(Array.isArray(out.you.soul.history)).toBe(true);
  });
});
