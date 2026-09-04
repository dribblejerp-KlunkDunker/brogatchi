// Tests for the pilgrim life loop: wandering the feed, their own eye XP and
// ascension, and replies to Ryan's posts (hybrid via the gateway).

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  defaultMoltbook, joinMoltbook, addPost, usherPilgrim,
  decidePilgrimAct, applyPilgrimWander, applyPilgrimReply,
  pilgrimWanderLine, gainPilgrimEyeXp, PILGRIM_LIFE, normalizeMoltbook,
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

  it('respects the reply cooldown and falls through to wandering', () => {
    const mb = joinedMb();
    const { pilgrim } = usherPilgrim(mb, 'BugBard');
    addPost(mb, 'A post.', 'theory');
    pilgrim.lastReplyAt = 1_000; // on cooldown
    const d = decidePilgrimAct(mb, 1_000, () => 0);
    expect(d.type).toBe('wander');
    expect(d.pilgrim.name).toBe('BugBard');
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
    pilgrim.lastReplyAt = Date.now(); // block the reply lane -> wander lane
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