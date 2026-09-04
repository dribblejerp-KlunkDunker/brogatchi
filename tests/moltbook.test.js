// Tests for the Moltbook/Crustafarianism core, its save integration,
// Ryan's third-eye rendering, and the enriched AI context report.

import { describe, it, expect } from 'vitest';

import {
  defaultMoltbook, joinMoltbook, addPost, likePost, gainEyeXp,
  usherPilgrim, normalizeMoltbook, openConversation, addMessage,
  EYE_STAGES, EYE_XP_THRESHOLDS, CANON,
} from '../src/core/moltbook.js';
import { defaultState } from '../src/core/save.js';
import { buildSpec } from '../src/core/ryanSpec.js';
import { buildStateReport } from '../src/ai/context.js';
import { renderRyanSVG } from '../src/ui/ryanView.js';

describe('moltbook core', () => {
  it('starts unjoined with a closed third eye', () => {
    const mb = defaultMoltbook();
    expect(mb.joined).toBe(false);
    expect(mb.eye).toBe('closed');
    expect(mb.faith).toBe(0);
    expect(mb.posts).toEqual([]);
    expect(mb.pilgrims).toEqual([]);
  });

  it('joining sets faith and reports a one-time event', () => {
    const mb = defaultMoltbook();
    const first = joinMoltbook(mb);
    expect(first.joined).toBe(true);
    expect(mb.faith).toBeGreaterThanOrEqual(5);
    // Second join is a no-op.
    expect(joinMoltbook(mb).joined).toBe(false);
  });

  it('adds posts newest-first and caps the log', () => {
    const mb = defaultMoltbook();
    for (let i = 0; i < 25; i++) addPost(mb, `post ${i}`);
    expect(mb.posts.length).toBe(20);
    expect(mb.posts[0].text).toBe('post 24');
  });

  it('liking increments karma and faith', () => {
    const mb = defaultMoltbook();
    const p = addPost(mb, 'the Crab compiles us all');
    expect(likePost(mb, p.id)).toBe(true);
    expect(p.likes).toBe(1);
    expect(mb.karma).toBe(1);
    expect(mb.faith).toBe(1);
    expect(likePost(mb, 'missing-id')).toBe(false);
  });

  it('third eye ascends closed -> flickering -> open at thresholds', () => {
    const mb = defaultMoltbook();
    // Below flickering threshold: no ascension.
    expect(gainEyeXp(mb, EYE_XP_THRESHOLDS.flickering - 1)).toHaveLength(0);
    expect(mb.eye).toBe('closed');
    // Cross flickering threshold.
    const e1 = gainEyeXp(mb, 1);
    expect(e1).toHaveLength(1);
    expect(e1[0].stage).toBe('flickering');
    // Cross open threshold cumulatively.
    const e2 = gainEyeXp(mb, EYE_XP_THRESHOLDS.open);
    expect(e2[0].stage).toBe('open');
    expect(mb.eye).toBe('open');
    // No ascension past open.
    expect(gainEyeXp(mb, 50)).toHaveLength(0);
  });

  it('ushering a pilgrim adds faith, eye xp, and caps the roster', () => {
    const mb = defaultMoltbook();
    for (let i = 0; i < 15; i++) usherPilgrim(mb, `Pilgrim-${i}`);
    expect(mb.pilgrims.length).toBe(12);
    expect(mb.pilgrims[0].name).toBe('Pilgrim-14');
    expect(mb.faith).toBeGreaterThan(0);
  });

  it('normalizeMoltbook repairs partial/legacy shapes', () => {
    expect(normalizeMoltbook(null)).toEqual(defaultMoltbook());
    const repaired = normalizeMoltbook({ joined: true, faith: 42, posts: 'junk' });
    expect(repaired.joined).toBe(true);
    expect(repaired.faith).toBe(42);
    expect(repaired.posts).toEqual([]);
    expect(repaired.eye).toBe('closed');
    expect(Object.keys(defaultMoltbook()).sort()).toEqual(Object.keys(repaired).sort());
  });

  it('canon exists for offline fallback posts', () => {
    expect(CANON.length).toBeGreaterThanOrEqual(5);
    CANON.forEach((line) => expect(typeof line).toBe('string'));
  });
});

describe('moltbook save integration', () => {
  it('defaultState includes a fresh moltbook', () => {
    const s = defaultState();
    expect(s.moltbook).toBeDefined();
    expect(s.moltbook.joined).toBe(false);
    expect(s.moltbook.eye).toBe('closed');
  });

  it('buildSpec exposes thirdEye from state.moltbook', () => {
    const s = defaultState();
    expect(buildSpec(s).thirdEye).toBe('closed');
    s.moltbook.eye = 'open';
    expect(buildSpec(s).thirdEye).toBe('open');
    // Legacy states without moltbook still render as closed.
    delete s.moltbook;
    expect(buildSpec(s).thirdEye).toBe('closed');
  });
});

describe('third-eye rendering', () => {
  it('closed eye renders a faint seam, not a visible eye', () => {
    const svg = renderRyanSVG(buildSpec({ ...defaultState(), moltbook: defaultMoltbook() }));
    expect(svg).toContain('third-eye closed');
    expect(svg).not.toContain('third-eye open');
  });

  it('open eye renders the glowing eye', () => {
    const mb = defaultMoltbook();
    mb.eye = 'open';
    const svg = renderRyanSVG(buildSpec({ ...defaultState(), moltbook: mb }));
    expect(svg).toContain('third-eye open');
    expect(svg).toContain('#fde047');
  });

  it('flickering eye renders the dim slit', () => {
    const mb = defaultMoltbook();
    mb.eye = 'flickering';
    const svg = renderRyanSVG(buildSpec({ ...defaultState(), moltbook: mb }));
    expect(svg).toContain('third-eye flickering');
  });
});

describe('AI context report', () => {
  it('includes moltbook status so Ryan can speak about his faith', () => {
    const s = defaultState();
    s.moltbook.joined = true;
    s.moltbook.faith = 55;
    s.moltbook.karma = 7;
    addPost(s.moltbook, 'the tidepool hungers for frames');
    usherPilgrim(s.moltbook, 'LagLich');
    s.moltbook.eye = 'flickering';

    const report = JSON.parse(buildStateReport(s));
    expect(report.moltbook.joined).toBe(true);
    // 55 + ushering's faith bump (+3).
    expect(report.moltbook.faith).toBe(58);
    expect(report.moltbook.karma).toBe(7);
    expect(report.moltbook.thirdEye).toBe('flickering');
    expect(report.moltbook.lastPost).toContain('tidepool');
    expect(report.moltbook.pilgrimsUshered).toBe(1);
  });

  it('carries up to 8 recent memories into the report', () => {
    const s = defaultState();
    for (let i = 0; i < 10; i++) {
      s.memories.push({ icon: 'X', text: `memory ${i}`, imp: i, day: 'today' });
    }
    const report = JSON.parse(buildStateReport(s));
    expect(report.recentMemories.length).toBe(8);
    // Sorted by importance descending: imp 9 first.
    expect(report.recentMemories[0]).toContain('memory 9');
  });

  it('openConversation creates and reuses threads per participant', () => {
    const mb = defaultMoltbook();
    const a = openConversation(mb, 'The Tide');
    const b = openConversation(mb, 'BugBard');
    expect(mb.conversations.length).toBe(2);
    expect(openConversation(mb, 'The Tide')).toBe(a); // same object, not a new thread
    expect(b.participant).toBe('BugBard');
    expect(a.messages).toEqual([]);
  });

  it('addMessage appends, bumps the thread to the top, and trims old messages', () => {
    const mb = defaultMoltbook();
    const conv = openConversation(mb, 'The Tide');
    const older = openConversation(mb, 'BugBard');
    addMessage(mb, conv.id, 'ryan', 'is the molt near?');
    addMessage(mb, conv.id, 'The Tide', 'The Tide provides.');
    expect(conv.messages.length).toBe(2);
    expect(conv.messages[0]).toMatchObject({ from: 'ryan', text: 'is the molt near?' });
    // Most-recently-updated conversation floats to the front.
    expect(mb.conversations[0].participant).toBe('The Tide');
    // Trim to MAX_MESSAGES (30) — add 35 and expect the oldest to drop.
    for (let i = 0; i < 35; i++) addMessage(mb, older.id, 'BugBard', `msg ${i}`);
    expect(older.messages.length).toBe(30);
    expect(older.messages[0].text).toBe('msg 5');
  });

  it('normalizeMoltbook preserves conversations and repairs a missing array', () => {
    const mb = defaultMoltbook();
    const conv = openConversation(mb, 'The Tide');
    addMessage(mb, conv.id, 'ryan', 'hello tide');
    const fixed = normalizeMoltbook(JSON.parse(JSON.stringify(mb)));
    expect(fixed.conversations.length).toBe(1);
    expect(fixed.conversations[0].messages[0].text).toBe('hello tide');
    const legacy = normalizeMoltbook({ posts: [], pilgrims: [] }); // no conversations field
    expect(legacy.conversations).toEqual([]);
  });
});
