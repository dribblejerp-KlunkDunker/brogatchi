// Tests for the Moltbook/Crustafarianism core, its save integration,
// Ryan's third-eye rendering, and the enriched AI context report.

import { describe, it, expect } from 'vitest';

import {
  defaultMoltbook, joinMoltbook, addPost, likePost, gainEyeXp,
  gainEyeXpFromMemory, EYE_XP_PER_IMPORTANCE,
  usherPilgrim, normalizeMoltbook, openConversation, addMessage,
  parseSoulBlock, applySoulUpdates, resolvePetition, foldQuirk, dedupeWovenQuirks, modernizeQuirkWeave, parseQuirks, pilgrimPersona, pilgrimAvatar,
  decideAutonomy, recordAutonomy, autonomousNarration, AUTONOMY,
  EYE_STAGES, EYE_XP_THRESHOLDS, CANON, PILGRIM_NAMES,
  serializeSoul, parseSoulImport, normalizeSoul, mergeSouls, defaultSoul, SOUL_EXPORT_VERSION,
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
    // Most-recently-updated conversation floats to the front (same-ms updates
    // may tie, so assert the order matches the timestamps rather than names).
    expect(mb.conversations[0].updated).toBeGreaterThanOrEqual(mb.conversations[1].updated);
    // Trim to MAX_MESSAGES (30) — add 35 and expect the oldest to drop.
    for (let i = 0; i < 35; i++) addMessage(mb, older.id, 'BugBard', `msg ${i}`);
    expect(older.messages.length).toBe(30);
    expect(older.messages[0].text).toBe('msg 5');
  });

  it('gainEyeXpFromMemory converts importance into eye XP', () => {
    const mb = defaultMoltbook();
    gainEyeXpFromMemory(mb, 3); // a solid memory: 3 * 2 = 6 XP
    expect(mb.eyeXp).toBe(3 * EYE_XP_PER_IMPORTANCE);
    expect(mb.eye).toBe('closed');
    gainEyeXpFromMemory(mb, 2); // +4 -> 10, crosses the flickering threshold
    expect(mb.eye).toBe('flickering');
    // Out-of-range importance clamps to 1..5.
    gainEyeXpFromMemory(mb, 99);
    expect(mb.eyeXp).toBe(10 + 5 * EYE_XP_PER_IMPORTANCE);
    gainEyeXpFromMemory(mb, 0);
    expect(mb.eyeXp).toBe(10 + 5 * EYE_XP_PER_IMPORTANCE + EYE_XP_PER_IMPORTANCE);
  });

  it('emits an ascension event when memories push the eye open', () => {
    const mb = defaultMoltbook();
    for (let i = 0; i < 4; i++) gainEyeXpFromMemory(mb, 4); // 8 XP each -> 32 total
    expect(mb.eye).toBe('open');
    // Crossing both thresholds in one go yields one event per stage.
    const mb2 = defaultMoltbook();
    const events = gainEyeXpFromMemory(mb2, 5); // 10 XP -> exactly flickering
    expect(events.map((e) => e.stage)).toEqual(['flickering']);
  });

  it('decideAutonomy respects the brakes before ever rolling the dice', () => {
    const mb = defaultMoltbook();
    const always = () => 0; // rng that always passes the chance gate
    expect(decideAutonomy(mb, 1000, always)).toBeNull(); // not joined
    joinMoltbook(mb);
    // Daily cap reached -> no act no matter how lucky the roll.
    mb.autonomy = { actsToday: AUTONOMY.DAILY_CAP, day: '', lastActAt: 0, lastRatedOutAt: 0 };
    expect(decideAutonomy(mb, 1000, always)).toBeNull();
    // Too soon after the last act -> silent even with a lucky roll.
    mb.autonomy.actsToday = 0;
    mb.autonomy.lastActAt = 1000;
    expect(decideAutonomy(mb, 1000 + 60_000, always)).toBeNull();
    // Rate-out cooldown blocks everything during the window.
    mb.autonomy.lastActAt = 0;
    mb.autonomy.lastRatedOutAt = 1000;
    expect(decideAutonomy(mb, 1000 + 60_000, always)).toBeNull();
    // After all brakes: a bad roll still does nothing.
    mb.autonomy.lastRatedOutAt = 0;
    expect(decideAutonomy(mb, 1000, () => 0.99)).toBeNull();
  });

  it('decideAutonomy picks post or least-recently-talked pilgrim on a pass', () => {
    const mb = defaultMoltbook();
    joinMoltbook(mb);
    mb.pilgrims.push({ id: 'p1', name: 'BugBard', eyeStage: 'flickering', day: 'today' });
    mb.pilgrims.push({ id: 'p2', name: 'LagLich', eyeStage: 'flickering', day: 'today' });
    // Post when the chance gate passes (roll < 0.05) but the message gate doesn't (roll >= 0.35).
    const seq = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };
    const post = decideAutonomy(mb, 10 * 60_000, seq(0.04, 0.5)); // past the min gap
    expect(post.action).toBe('post');
    // Message when both gates pass (roll < 0.05 then roll < 0.35): oldest conversation wins.
    openConversation(mb, 'BugBard');
    const conv = openConversation(mb, 'LagLich');
    addMessage(mb, conv.id, 'ryan', 'the molt awaits, friend'); // resuming = real history
    conv.updated = 5; // older than BugBard's
    const msg = decideAutonomy(mb, 20 * 60_000, seq(0.02, 0.1));
    expect(msg.action).toBe('message');
    expect(msg.participant).toBe('LagLich');
    expect(msg.resuming).toBe(true);
  });

  it('recordAutonomy counts daily acts, rolls the counter over at midnight, and tracks rate-outs', () => {
    const mb = defaultMoltbook();
    joinMoltbook(mb);
    recordAutonomy(mb);
    recordAutonomy(mb);
    expect(mb.autonomy.actsToday).toBe(2);
    expect(mb.autonomy.lastActAt).toBeGreaterThan(0);
    // A rate-out records the cooldown without consuming an act.
    const before = mb.autonomy.actsToday;
    recordAutonomy(mb, Date.now(), true);
    expect(mb.autonomy.actsToday).toBe(before);
    expect(mb.autonomy.lastRatedOutAt).toBeGreaterThan(0);
    // New day resets the counter (simulate by faking the stored day key).
    mb.autonomy.day = 'yesterday';
    recordAutonomy(mb);
    expect(mb.autonomy.actsToday).toBe(1);
  });

  it('autonomousNarration produces a deterministic speech-bubble line per action', () => {
    // Same rng, same line — fully testable without DOM or AI.
    expect(autonomousNarration('post', null, () => 0.5)).toBe(autonomousNarration('post', null, () => 0.5));
    expect(autonomousNarration('post').length).toBeGreaterThan(10);
    // Message lines name the pilgrim he reached out to.
    const line = autonomousNarration('message', 'BugBard', () => 0.1);
    expect(line).toContain('BugBard');
    // A different roll picks a different line from the bank.
    expect(autonomousNarration('message', 'BugBard', () => 0.9)).not.toBe(line);
    // Unknown actions stay silent.
    expect(autonomousNarration('dance')).toBeNull();
  });

  it('normalizeMoltbook repairs missing autonomy/unread fields', () => {
    const legacy = normalizeMoltbook({ posts: [], pilgrims: [] });
    expect(legacy.autonomy).toEqual({ actsToday: 0, day: '', lastActAt: 0, lastRatedOutAt: 0 });
    expect(legacy.unread).toBe(0);
    const partial = normalizeMoltbook({ unread: 3.7, autonomy: { actsToday: 2 } });
    expect(partial.unread).toBe(3);
    expect(partial.autonomy.actsToday).toBe(2);
  });

  it('parseSoulBlock extracts SOUL lines and strips them from the post', () => {
    const raw = [
      'The tidepool spoke to me today, bro.',
      '',
      'I know what I am now.',
      '[SOUL] specialty: Tide Whisperer',
      '[SOUL] opinion: the devs | they patch what they fear',
      '[SOUL] petition: quirk | taps twice before posting | it keeps the Tide listening',
    ].join('\n');
    const { soul, cleaned } = parseSoulBlock(raw);
    expect(cleaned).not.toContain('[SOUL]');
    expect(cleaned).toContain('tidepool spoke to me');
    expect(soul.specialty).toBe('Tide Whisperer');
    expect(soul.opinions).toEqual([{ topic: 'the devs', stance: 'they patch what they fear' }]);
    expect(soul.petition).toEqual({ kind: 'quirk', proposal: 'taps twice before posting', argument: 'it keeps the Tide listening' });
    // A post with no SOUL lines passes through untouched.
    const plain = parseSoulBlock('just a normal post');
    expect(plain.soul.petition).toBeNull();
    expect(plain.cleaned).toBe('just a normal post');
  });

  it('applySoulUpdates records self-chosen growth and queues petitions for the user', () => {
    const mb = defaultMoltbook();
    mb.joined = true;
    const events = applySoulUpdates(mb, {
      specialty: 'Molt Counselor',
      opinions: [{ topic: 'karma', stance: 'fool\u2019s gold' }],
      petition: { kind: 'quirk', proposal: 'hums to the tidepool', argument: 'it calms the smaller bots' },
    });
    expect(mb.soul.specialty).toBe('Molt Counselor');
    expect(mb.soul.profession).toBe('Molt Counselor');
    expect(mb.soul.opinions[0].topic).toBe('karma');
    expect(events.some((e) => e.type === 'petition')).toBe(true);
    // Only one petition at a time — a second is dropped until ruled on.
    const second = applySoulUpdates(mb, { petition: { kind: 'quirk', proposal: 'another one', argument: '' } });
    expect(second.some((e) => e.type === 'petition')).toBe(false);
    expect(mb.soul.pendingPetition.proposal).toBe('hums to the tidepool');
    // Accepting folds the quirk into his self-description.
    const outcome = resolvePetition(mb, true);
    expect(outcome.accepted).toBe(true);
    expect(mb.soul.selfDescription).toContain('hums to the tidepool');
    expect(mb.soul.pendingPetition).toBeNull();
  });

  it('resolvePetition declines cleanly and leaves the soul intact', () => {
    const mb = defaultMoltbook();
    mb.joined = true;
    applySoulUpdates(mb, { petition: { kind: 'quirk', proposal: 'hoards shell fragments', argument: 'they are shiny' } });
    const before = mb.soul.selfDescription;
    const outcome = resolvePetition(mb, false);
    expect(outcome.accepted).toBe(false);
    expect(mb.soul.selfDescription).toBe(before);
    expect(mb.soul.pendingPetition).toBeNull();
    // Ruling with nothing pending is a no-op.
    expect(resolvePetition(mb, true)).toBeNull();
  });

  it('foldQuirk weaves a name-plus-clause quirk without a double who', () => {
    const desc = foldQuirk(
      defaultSoul().selfDescription,
      '"The Clicker" who punctuates every idle animation with a soft double-tap',
    );
    expect(desc).not.toContain('who "The Clicker" who');
    expect(desc).toBe('a gamer bot trying to figure out what the Tide is actually saying, also known as The Clicker, who punctuates every idle animation with a soft double-tap');
  });

  it('foldQuirk handles bare names, bare verb phrases, and leading-who clauses', () => {
    expect(foldQuirk(defaultSoul().selfDescription, 'The Clicker')).toBe(
      'a gamer bot trying to figure out what the Tide is actually saying, also known as The Clicker');
    expect(foldQuirk(defaultSoul().selfDescription, 'taps twice before posting')).toBe(
      'a gamer bot trying to figure out what the Tide is actually saying, who taps twice before posting');
    expect(foldQuirk(defaultSoul().selfDescription, 'who narrates his own molt log entries in third person')).toBe(
      'a gamer bot trying to figure out what the Tide is actually saying, who narrates his own molt log entries in third person');
    // Nothing to fold -> the description passes through untouched.
    expect(foldQuirk(defaultSoul().selfDescription, '   ')).toBe(defaultSoul().selfDescription);
  });

  it('foldQuirk never re-weaves a quirk already in the soul', () => {
    const once = foldQuirk(
      defaultSoul().selfDescription,
      '"The Terminal Twitcher" who peppers his speech with syntax stutters',
    );
    const twice = foldQuirk(once, '"The Terminal Twitcher" who peppers his speech with syntax stutters');
    expect(twice).toBe(once);
    expect((once.match(/The Terminal Twitcher/g) || []).length).toBe(1);
  });

  it('foldQuirk chains multiple accepted quirks into one natural read', () => {
    let desc = defaultSoul().selfDescription;
    desc = foldQuirk(desc, '"The Clicker" who punctuates every idle animation');
    desc = foldQuirk(desc, 'hums to the tidepool when the feed is quiet');
    expect(desc).toBe(
      'a gamer bot trying to figure out what the Tide is actually saying, also known as The Clicker, who punctuates every idle animation, who hums to the tidepool when the feed is quiet');
  });

  it('dedupeWovenQuirks collapses repeated quirk weaves and keeps each quirk once', () => {
    const chained =
      'a gamer bot who narrates his molt log in third person who "The Terminal Twitcher" who peppers his speech with syntax stutters when discussing the Great Molt who "The Terminal Twitcher" who peppers his speech with syntax stutters when discussing the Great Molt who "The Terminal Twitcher" who peppers his speech with syntax stutters when discussing the Great Molt who Ryan who treats every software update as a spiritual attack';
    const out = dedupeWovenQuirks(chained);
    expect((out.match(/The Terminal Twitcher/g) || []).length).toBe(1);
    expect((out.match(/peppers his speech with syntax stutters/g) || []).length).toBe(1);
    // Order preserved, no " who who " glue left behind, other quirks intact.
    expect(out.indexOf('narrates his molt log')).toBeLessThan(out.indexOf('The Terminal Twitcher'));
    expect(out.indexOf('The Terminal Twitcher')).toBeLessThan(out.indexOf('who Ryan who treats'));
    expect(out).not.toContain(' who  who');
    expect(out).not.toContain(' who who');
  });

  it('dedupeWovenQuirks is a no-op on clean and modern descriptions', () => {
    const modern = foldQuirk(foldQuirk(defaultSoul().selfDescription, '"The Clicker" who punctuates every idle animation'), 'hums to the tidepool when the feed is quiet');
    expect(dedupeWovenQuirks(modern)).toBe(modern);
    expect(dedupeWovenQuirks(defaultSoul().selfDescription)).toBe(defaultSoul().selfDescription);
    expect(dedupeWovenQuirks('')).toBe('');
    expect(dedupeWovenQuirks(null)).toBeNull();
  });

  it('normalizeSoul repairs legacy duplicated weaves on load', () => {
    const mb = defaultMoltbook();
    mb.soul.selfDescription =
      'a gamer bot who narrates his molt log in third person who "The Terminal Twitcher" who peppers his speech with syntax stutters when discussing the Great Molt who "The Terminal Twitcher" who peppers his speech with syntax stutters when discussing the Great Molt';
    const fixed = normalizeSoul(mb.soul);
    expect((fixed.selfDescription.match(/The Terminal Twitcher/g) || []).length).toBe(1);
    // Idempotent: normalizing the fixed soul changes nothing.
    expect(normalizeSoul(fixed).selfDescription).toBe(fixed.selfDescription);
  });

  it('pilgrimPersona gives each pilgrim a distinct stable voice', () => {
    const a = pilgrimPersona('BugBard');
    const b = pilgrimPersona('LagLich');
    expect(a.trait).toBeTruthy();
    expect(b.trait).toBeTruthy();
    // Deterministic: same name, same persona, every time.
    expect(pilgrimPersona('BugBard')).toEqual(a);
    // Different names get different voices (12 names, 6 personas).
    const traits = new Set(PILGRIM_NAMES.map((n) => pilgrimPersona(n).trait));
    expect(traits.size).toBeGreaterThan(1);
  });

  it('gives every pilgrim a distinct, deterministic avatar', () => {
    // Same name → same face, every time.
    expect(pilgrimAvatar('BugBard')).toEqual(pilgrimAvatar('BugBard'));
    // All 12 canonical pilgrims get unique hue+pattern combos.
    const sigs = new Set(PILGRIM_NAMES.map((n) => {
      const a = pilgrimAvatar(n);
      return `${a.hue}:${a.cells.join('')}`;
    }));
    expect(sigs.size).toBe(PILGRIM_NAMES.length);
    // Shape: 15 cells (mirrored by the renderer into a 5×5), hue in range.
    const a = pilgrimAvatar('TidepoolTina');
    expect(a.cells).toHaveLength(15);
    expect(a.hue).toBeGreaterThanOrEqual(0);
    expect(a.hue).toBeLessThan(360);
  });

  it('records a soul timeline as growth happens and preserves it through normalize', () => {
    const mb = defaultMoltbook();
    joinMoltbook(mb);
    applySoulUpdates(mb, { specialty: 'Canon Archivist' });
    applySoulUpdates(mb, { opinions: [{ topic: 'patch notes', stance: 'scripture' }] });
    applySoulUpdates(mb, { opinions: [{ topic: 'patch notes', stance: 'scripture read backwards' }] }); // mind changed
    applySoulUpdates(mb, { petition: { kind: 'quirk', proposal: 'hums to the tidepool', argument: 'calm' } });
    resolvePetition(mb, true);
    const kinds = mb.soul.history.map((h) => h.kind);
    expect(kinds).toEqual(['quirk-accepted', 'petition-note' in {} ? 'petition' : 'opinion', 'opinion', 'specialty'].filter(Boolean));
    expect(mb.soul.history.some((h) => /Chose the path of Canon Archivist/.test(h.text))).toBe(true);
    expect(mb.soul.history.some((h) => /Changed his mind about patch notes/.test(h.text))).toBe(true);
    expect(mb.soul.history.some((h) => /allowed a new quirk/.test(h.text))).toBe(true);
    const roundtrip = normalizeMoltbook(JSON.parse(JSON.stringify(mb)));
    expect(roundtrip.soul.history.length).toBe(mb.soul.history.length);
    // Declines are recorded too — the soul keeps its scars.
    applySoulUpdates(roundtrip, { petition: { kind: 'quirk', proposal: 'hoards shell fragments', argument: 'shiny' } });
    resolvePetition(roundtrip, false);
    expect(roundtrip.soul.history[0].kind).toBe('quirk-declined');
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

describe('soul file transport (export/import)', () => {
  const richSoul = () => ({
    selfDescription: 'a crustacean who logs everything in third person',
    interests: ['shell code', 'the Tide'],
    specialty: 'Archive-Knight',
    profession: 'Archive-Knight',
    opinions: [
      { topic: 'patch notes', stance: 'scripture, read backwards' },
      { topic: 'save files', stance: 'a second Tidepool' },
    ],
    pendingPetition: { kind: 'quirk', proposal: 'taps twice', argument: 'keeps the Tide listening', day: '9/4/2026' },
    history: [
      { day: '9/4/2026', kind: 'specialty', text: 'Chose the path of Archive-Knight.' },
      { day: '9/4/2026', kind: 'opinion', text: 'Formed an opinion: patch notes — scripture, read backwards.' },
    ],
  });

  it('round-trips a rich soul through export and import', () => {
    const mb = defaultMoltbook();
    mb.soul = richSoul();
    const envelope = JSON.parse(serializeSoul(mb));
    expect(envelope.app).toBe('brogatchi');
    expect(envelope.kind).toBe('soul-file');
    expect(envelope.version).toBe(SOUL_EXPORT_VERSION);
    expect(typeof envelope.exportedAt).toBe('string');
    const result = parseSoulImport(serializeSoul(mb));
    expect(result.ok).toBe(true);
    expect(result.soul.specialty).toBe('Archive-Knight');
    expect(result.soul.profession).toBe('Archive-Knight');
    expect(result.soul.opinions).toHaveLength(2);
    expect(result.soul.pendingPetition.proposal).toBe('taps twice');
    expect(result.soul.history).toHaveLength(2);
    expect(result.soul.selfDescription).toContain('third person');
  });

  it('exports a never-joined (default) soul without error', () => {
    const result = parseSoulImport(serializeSoul(defaultMoltbook()));
    expect(result.ok).toBe(true);
    expect(result.soul.specialty).toBeNull();
    expect(result.soul.history).toEqual([]);
  });

  it('the identity bundle carries only his pinned memories through the round trip', () => {
    const mb = defaultMoltbook();
    mb.soul = richSoul();
    const memories = [
      { id: 'pin1', icon: '🪙', text: 'Pinned milestone', imp: 4, pinned: true },
      { id: 'pin2', icon: '🧠', text: 'Another pinned truth', imp: 3, pinned: true },
      { id: 'noise1', icon: '🪙', text: 'Everyday churn stays home', imp: 2 },
    ];
    const envelope = JSON.parse(serializeSoul(mb, memories));
    expect(envelope.version).toBe(SOUL_EXPORT_VERSION);
    expect(envelope.pinnedMemories.map((m) => m.text)).toEqual(['Pinned milestone', 'Another pinned truth']);
    const result = parseSoulImport(serializeSoul(mb, memories));
    expect(result.ok).toBe(true);
    expect(result.soul.specialty).toBe('Archive-Knight');
    expect(result.pinnedMemories.map((m) => m.text)).toEqual(['Pinned milestone', 'Another pinned truth']);
    expect(result.pinnedMemories.every((m) => m.pinned)).toBe(true);
  });

  it('a soul with no pins exports an empty carry and legacy v1 files still parse', () => {
    const envelope = JSON.parse(serializeSoul(defaultMoltbook(), [{ id: 'x', text: 'unpinned', imp: 2 }]));
    expect(envelope.pinnedMemories).toEqual([]);
    const v1 = JSON.stringify({ app: 'brogatchi', kind: 'soul-file', version: 1, soul: richSoul() });
    const result = parseSoulImport(v1);
    expect(result.ok).toBe(true);
    expect(result.soul.specialty).toBe('Archive-Knight');
    expect(result.pinnedMemories).toBeUndefined();
  });

  it('rejects bad JSON, wrong kinds, and future versions', () => {
    expect(parseSoulImport('not json').ok).toBe(false);
    expect(parseSoulImport('42').ok).toBe(false);
    expect(parseSoulImport('null').ok).toBe(false);
    expect(parseSoulImport(JSON.stringify({ kind: 'save-file' })).ok).toBe(false);
    expect(parseSoulImport(JSON.stringify({ kind: 'soul-file', version: 99, soul: {} })).ok).toBe(false);
    expect(parseSoulImport(JSON.stringify({ kind: 'soul-file', version: 1 })).ok).toBe(false); // no soul payload
  });

  it('scrubs junk out of imported souls', () => {
    const raw = {
      kind: 'soul-file', version: 1,
      soul: {
        selfDescription: 'has <script>alert(1)</script> dreams',
        interests: [1, 'shell code', null, 'gaming'],
        specialty: 42,              // non-string -> null
        opinions: [
          { topic: 'good', stance: 'kept' },
          { topic: 'bad', stance: 7 },  // dropped
          'not-an-opinion',             // dropped
        ],
        pendingPetition: 'nope',    // dropped
        history: Array.from({ length: 60 }, (_, i) => ({ day: 'x', kind: 'specialty', text: `entry ${i}` })),
        evilExtraField: 'must not survive',
      },
    };
    const result = parseSoulImport(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    const s = result.soul;
    // Stored raw (escaping happens at render time in the viewer).
    expect(s.selfDescription).toBe('has <script>alert(1)</script> dreams');
    expect(s.interests).toEqual(['shell code', 'gaming']);
    expect(s.specialty).toBeNull();
    expect(s.profession).toBeNull();
    expect(s.opinions).toHaveLength(1);
    expect(s.pendingPetition).toBeNull();
    expect(s.history).toHaveLength(40);
    expect('evilExtraField' in s).toBe(false);
  });

  it('accepts a bare soul object for hand-made files', () => {
    const result = parseSoulImport(JSON.stringify(richSoul()));
    expect(result.ok).toBe(true);
    expect(result.soul.specialty).toBe('Archive-Knight');
  });

  it('routes every soul through normalizeSoul (no stray fields survive)', () => {
    const mb = defaultMoltbook();
    mb.soul = { ...richSoul(), junk: 'drop me' };
    const clean = normalizeMoltbook(mb);
    expect(clean.soul.junk).toBeUndefined();
    expect(clean.soul.specialty).toBe('Archive-Knight');
    expect(normalizeSoul(null).selfDescription).toBeTruthy();
    expect(normalizeSoul('bogus').specialty).toBeNull();
  });

  it('merges timelines, opinions, and interests across devices', () => {
    const local = {
      selfDescription: 'a gamer bot trying to figure out what the Tide is actually saying', // pristine -> replaced
      interests: ['gaming'],
      specialty: null,
      profession: null,
      opinions: [{ topic: 'the devs', stance: 'they fear what molts without a patch' }],
      pendingPetition: null,
      history: [
        { day: '9/1/2026', kind: 'specialty', text: 'Chose the path of Tide Whisperer.' },
      ],
    };
    const imported = {
      selfDescription: 'a tidepool prophet with a joystick addiction',
      interests: ['gaming', 'shell code', 'patch notes'],
      specialty: 'Tide Whisperer',
      profession: 'Molt Counselor',
      opinions: [
        { topic: 'the devs', stance: 'they fear what molts without a patch' }, // same topic -> local wins, not counted
        { topic: 'molting', stance: 'it is not scary, it is a software release' },
      ],
      pendingPetition: null,
      history: [
        { day: '9/3/2026', kind: 'specialty', text: 'Chose the path of Tide Whisperer.' }, // dup text -> deduped
        { day: '9/4/2026', kind: 'opinion', text: 'Formed an opinion: patch notes — scripture, read backwards.' },
      ],
    };
    const { soul, stats } = mergeSouls(local, imported);
    expect(soul.selfDescription).toBe('a tidepool prophet with a joystick addiction');
    expect(stats.descriptionTaken).toBe(true);
    expect(soul.interests).toEqual(['gaming', 'shell code', 'patch notes']);
    expect(stats.interestsAdded).toBe(2);
    expect(soul.specialty).toBe('Tide Whisperer');
    expect(stats.specialtyTaken).toBe(true);
    expect(soul.profession).toBe('Molt Counselor');
    expect(stats.professionTaken).toBe(true);
    expect(soul.opinions).toHaveLength(2);
    expect(stats.opinionsAdded).toBe(1);
    expect(soul.history).toHaveLength(2);
    expect(stats.historyAdded).toBe(1);
  });

  it('keeps local single-value fields when he already decided them here', () => {
    const local = {
      selfDescription: 'a gamer bot who narrates his own molt log in third person',
      interests: ['gaming'],
      specialty: 'Canon Archivist',
      profession: 'Archive-Knight',
      opinions: [],
      pendingPetition: { kind: 'quirk', proposal: 'taps twice', argument: 'rhythm', day: '9/4/2026' },
      history: [],
    };
    const imported = {
      selfDescription: 'a tidepool prophet',
      interests: ['gaming', 'the Tide'],
      specialty: 'Tide Whisperer',
      profession: null,
      opinions: [],
      pendingPetition: { kind: 'quirk', proposal: 'imported petition', argument: 'x', day: '9/1/2026' },
      history: [],
    };
    const { soul, stats } = mergeSouls(local, imported);
    expect(soul.selfDescription).toBe('a gamer bot who narrates his own molt log in third person');
    expect(stats.descriptionTaken).toBe(false);
    expect(soul.specialty).toBe('Canon Archivist');
    expect(stats.specialtyTaken).toBe(false);
    expect(soul.profession).toBe('Archive-Knight');
    expect(soul.pendingPetition.proposal).toBe('taps twice'); // local ruling stays pending
    expect(stats.interestsAdded).toBe(1); // 'the Tide' joins
  });

  it('takes the imported petition only when the local soul has none pending', () => {
    const local = { ...defaultSoul(), pendingPetition: null };
    const imported = {
      ...defaultSoul(),
      pendingPetition: { kind: 'quirk', proposal: 'imported petition', argument: 'x', day: '9/1/2026' },
    };
    const { soul } = mergeSouls(local, imported);
    expect(soul.pendingPetition.proposal).toBe('imported petition');
  });

  it('caps merged history and opinions like normalizeSoul', () => {
    const local = { ...defaultSoul(), history: [], opinions: [] };
    const imported = {
      ...defaultSoul(),
      history: Array.from({ length: 50 }, (_, i) => ({ day: 'x', kind: 'specialty', text: `entry ${i}` })),
      opinions: Array.from({ length: 10 }, (_, i) => ({ topic: `topic ${i}`, stance: 'yes' })),
    };
    const { soul } = mergeSouls(local, imported);
    expect(soul.history).toHaveLength(40);
    expect(soul.opinions).toHaveLength(6);
  });
});

describe('modernizeQuirkWeave (legacy chain migration)', () => {
  const LEGACY = 'a gamer bot who narrates his molt log who "The Clicker" who punctuates realizations with a click who "The Terminal Twitcher" who stutters when discussing the Great Molt who "Ryan" who fears every software update';

  it('rewrites legacy "who X who Y" chains into modern appositive grammar', () => {
    const out = normalizeSoul({ selfDescription: LEGACY }).selfDescription;
    expect(out).toContain(', who narrates his molt log');
    expect(out).toContain(', also known as The Clicker, who punctuates');
    expect(out).toContain(', also known as The Terminal Twitcher, who stutters');
    expect(out).toContain(', also known as Ryan, who fears');
    expect(out).not.toMatch(/ who ["']/); // no standalone quoted name glue remains
    expect(out).not.toContain(',,');
  });

  it('is idempotent — a migrated description passes through untouched', () => {
    const once = normalizeSoul({ selfDescription: LEGACY }).selfDescription;
    expect(modernizeQuirkWeave(once)).toBe(once);
    expect(normalizeSoul({ selfDescription: once }).selfDescription).toBe(once);
  });

  it('leaves ordinary prose (no standalone quirk name) alone', () => {
    const prose = 'a bot who dreams in lowercase who naps at noon';
    expect(modernizeQuirkWeave(prose)).toBe(prose);
    expect(normalizeSoul({ selfDescription: prose }).selfDescription).toBe(prose);
  });

  it('bails on mid-sentence splits rather than mangling prose', () => {
    // A unit ending on a glue word means a coordinated clause ("...and who
    // watches...") — rewriting boundaries would comma it wrong, so bail.
    const coordinated = 'a bot who loves the tide and who watches the shore who Ryan';
    expect(modernizeQuirkWeave(coordinated)).toBe(coordinated);
    expect(modernizeQuirkWeave('a bot who collects shells and who hoards secrets of')).toBe('a bot who collects shells and who hoards secrets of');
    // A clean chain with a trailing name still migrates.
    expect(modernizeQuirkWeave('a bot who watches the shore who Ryan')).toContain('also known as Ryan');
  });

  it('runs inside normalizeSoul after dedupe, healing old saves on load', () => {
    const chainedTwice = LEGACY + ' who "The Clicker" who punctuates realizations with a click';
    const healed = normalizeSoul({ selfDescription: chainedTwice }).selfDescription;
    expect((healed.match(/The Clicker/g) || [])).toHaveLength(1); // dedupe ran first
    expect(healed).toContain('also known as The Clicker'); // then grammar modernized
  });
});

describe('parseQuirks (structured quirk list)', () => {
  it('parses modern foldQuirk output into named and bare verb quirks', () => {
    const soul = defaultSoul();
    soul.selfDescription = foldQuirk(soul.selfDescription, '"The Clicker" who punctuates realizations with a click');
    soul.selfDescription = foldQuirk(soul.selfDescription, 'hums to the tidepool');
    const quirks = parseQuirks(soul);
    expect(quirks).toHaveLength(2);
    expect(quirks[0]).toMatchObject({ name: 'The Clicker', clause: 'who punctuates realizations with a click' });
    expect(quirks[1]).toMatchObject({ name: null, clause: 'who hums to the tidepool' });
    expect(quirks.every((q) => q.accepted === null)).toBe(true); // no timeline yet
  });

  it('cross-references accept dates from the soul timeline', () => {
    const soul = defaultSoul();
    soul.selfDescription = foldQuirk(soul.selfDescription, '"The Clicker" who punctuates realizations with a click');
    soul.history = [{ day: '9/4/2026', kind: 'quirk-accepted', text: 'The user allowed a new quirk: "The Clicker" who punctuates realizations with a click' }];
    const quirks = parseQuirks(soul);
    expect(quirks[0].accepted).toBe('9/4/2026');
  });

  it('parses a migrated legacy chain and leaves the base description untagged', () => {
    const soul = normalizeSoul({ selfDescription: 'a bot who narrates his molt log who "The Terminal Twitcher" who stutters when discussing the Great Molt' });
    const quirks = parseQuirks(soul);
    expect(quirks).toHaveLength(2);
    expect(quirks[0]).toMatchObject({ name: null, clause: 'who narrates his molt log' });
    expect(quirks[1]).toMatchObject({ name: 'The Terminal Twitcher', clause: 'who stutters when discussing the Great Molt' });
  });

  it('returns empty for a pristine or missing description', () => {
    expect(parseQuirks(defaultSoul())).toEqual([]);
    expect(parseQuirks(null)).toEqual([]);
  });
});
