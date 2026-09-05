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
});