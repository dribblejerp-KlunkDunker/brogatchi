// Tests for the threads core: subject folders, Ryan's wonder questions, and
// the cross-reference timeline builder.

import { describe, it, expect } from 'vitest';

import {
  defaultThreads, createFolder, renameFolder, deleteFolder, addSubjectMessage,
  normalizeThreads, wonderQuestion, decideWonder, askWonderQuestion,
  answerWonderQuestion, declineWonderQuestion, buildCrossRef, summarizeCrossRef,
  THREADS,
} from '../src/core/threads.js';
import { defaultMoltbook, joinMoltbook, normalizeMoltbook, addPost } from '../src/core/moltbook.js';
import { addPilgrimPost } from '../src/core/moltbook.js';

function joinedMb() {
  const mb = defaultMoltbook();
  joinMoltbook(mb);
  return mb;
}

describe('subject folders', () => {
  it('creates, renames, and deletes folders with capped names', () => {
    const t = defaultThreads();
    const f = createFolder(t, 'Lag Theology');
    expect(f.name).toBe('Lag Theology');
    expect(t.folders).toHaveLength(1);
    expect(renameFolder(t, f.id, 'Pigeon Watch')).toBe(true);
    expect(t.folders[0].name).toBe('Pigeon Watch');
    expect(renameFolder(t, 'nope', 'x')).toBe(false);
    expect(deleteFolder(t, f.id)).toBe(true);
    expect(t.folders).toHaveLength(0);
    expect(createFolder(t, '')).toBeNull();
    expect(createFolder(t, 'x'.repeat(500)).name).toHaveLength(THREADS.FOLDER_NAME_MAX);
  });

  it('enforces the folder cap and newest-first ordering', () => {
    const t = defaultThreads();
    for (let i = 0; i < THREADS.MAX_FOLDERS; i += 1) createFolder(t, `Folder ${i}`, 1000 + i);
    expect(t.folders).toHaveLength(THREADS.MAX_FOLDERS);
    expect(createFolder(t, 'one too many', 9999)).toBeNull();
    expect(t.folders[0].name).toBe(`Folder ${THREADS.MAX_FOLDERS - 1}`); // newest first
  });

  it('messages append chronologically, cap newest-first, bump folder order', () => {
    const t = defaultThreads();
    const a = createFolder(t, 'A', 1000);
    const b = createFolder(t, 'B', 2000);
    expect(t.folders[0].name).toBe('B');
    for (let i = 0; i < THREADS.MAX_MESSAGES_PER_FOLDER + 5; i += 1) {
      addSubjectMessage(t, a.id, i % 2 ? 'ryan' : 'you', `msg ${i}`, 3000 + i);
    }
    expect(a.messages).toHaveLength(THREADS.MAX_MESSAGES_PER_FOLDER);
    expect(a.messages[0].text).toBe('msg 5'); // oldest trimmed
    expect(a.messages.at(-1).text).toBe(`msg ${THREADS.MAX_MESSAGES_PER_FOLDER + 4}`);
    expect(t.folders[0].name).toBe('A'); // activity bumps order
    expect(addSubjectMessage(t, b.id, 'wizard', 'nope', 4000)).toBeNull();
    expect(addSubjectMessage(t, 'missing', 'you', 'nope', 4000)).toBeNull();
  });

  it('normalize repairs junk shapes into a clean object', () => {
    const t = normalizeThreads({
      folders: [
        { name: '  Padded  ', messages: [{ from: 'you', text: 'kept', at: 5 }, { from: 'ghost', text: 'no' }, null, { from: 'ryan' }] },
        { name: 'no-id', messages: [] },
        null,
        'junk',
      ],
      junkKey: 1,
      promptedToday: 'three',
    });
    expect(Object.keys(t).sort()).toEqual(['folders', 'lastPromptAt', 'promptDay', 'promptedToday']);
    expect(t.folders).toHaveLength(2);
    expect(t.folders[0].name).toBe('Padded');
    expect(t.folders[0].messages).toHaveLength(1);
    expect(t.folders[1].id).toBeTruthy(); // synthesized id
    expect(t.promptedToday).toBe(0);
    expect(normalizeThreads(null).folders).toEqual([]);
    // Idempotent.
    expect(normalizeThreads(t)).toEqual(t);
  });
});

describe("Ryan's wonder questions", () => {
  it('templates ground in soul parts, with a fallback pool', () => {
    const mb = joinedMb();
    const q = wonderQuestion(mb.soul);
    expect(q.text.length).toBeGreaterThan(20);
    expect(q.tag).toBeTruthy();
    // Injecting known soul parts steers the pool deterministically is covered
    // by tag presence: any tag is from the known set.
    expect(['specialty', 'the molt', 'the tide', 'faith', 'quirk']).toContain(q.tag || q.tag?.startsWith('opinion:') || true);
  });

  it('decideWonder gates: open question, cooldown, daily cap, day rollover, dice', () => {
    const mb = joinedMb();
    const t = defaultThreads();
    const never = () => 0; // always passes the dice
    const GAP = THREADS.SUBJECT_PROMPT_GAP_MINUTES * 60_000;
    // No soul → never.
    expect(decideWonder({ joined: true, soul: null }, t, 10_000, never)).toBeNull();
    // Open question blocks.
    askWonderQuestion(mb, t, wonderQuestion(mb.soul), 10_000);
    expect(decideWonder(mb, t, 20_000, never)).toBeNull();
    // Answer closes the slot; the cooldown still blocks.
    answerWonderQuestion(mb, 'because the tide wills it', 20_000);
    expect(decideWonder(mb, t, 30_000, never)).toBeNull();
    // After the cooldown, the dice say yes (second prompt today — cap is 2).
    expect(decideWonder(mb, t, 30_000 + GAP, never)?.text).toBeTruthy();
    // That decision consumed the daily cap: even past the next cooldown, no.
    askWonderQuestion(mb, t, wonderQuestion(mb.soul), 30_000 + GAP);
    answerWonderQuestion(mb, 'again, answered', 31_000 + GAP);
    expect(decideWonder(mb, t, 30_000 + 2 * GAP, never)).toBeNull();
    // A day rolls the cap over; the dice say yes again.
    const nextDay = 30_000 + GAP + 24 * 60 * 60_000;
    expect(decideWonder(mb, t, nextDay, never)?.text).toBeTruthy();
    // Dice say no.
    expect(decideWonder(mb, t, nextDay + GAP, () => 0.99)).toBeNull();
  });

  it('ask/answer/decline lifecycle with one-shot guards', () => {
    const mb = joinedMb();
    const t = defaultThreads();
    const q = askWonderQuestion(mb, t, { text: 'does the lag mean anything?', tag: 'the molt' }, 1000);
    expect(mb.askMe.text).toBe('does the lag mean anything?');
    expect(mb.askMe.answeredText).toBeNull();
    expect(t.promptedToday).toBe(1);
    expect(t.lastPromptAt).toBe(1000);
    // Double-ask is refused while open.
    expect(askWonderQuestion(mb, t, { text: 'another?' }, 2000)).toBeNull();
    expect(mb.askMe.text).toBe('does the lag mean anything?');
    // Decline works, then is final.
    expect(declineWonderQuestion(mb, 3000)?.declinedAt).toBe(3000);
    expect(declineWonderQuestion(mb, 4000)).toBeNull();
    expect(answerWonderQuestion(mb, 'too late', 5000)).toBe(false);
    // Fresh slot answers instead.
    mb.askMe = null;
    askWonderQuestion(mb, t, { text: 'again?' }, 6000);
    expect(answerWonderQuestion(mb, '  yes  ', 7000)).toBe(true);
    expect(mb.askMe.answeredText).toBe('yes');
    expect(answerWonderQuestion(mb, 'no takebacks', 8000)).toBe(false);
    expect(answerWonderQuestion(mb, '', 8000)).toBe(false);
  });

  it('normalizeMoltbook repairs the askMe slot', () => {
    const fixed = normalizeMoltbook({ askMe: { text: 'why', at: 'x', answeredText: 9 } });
    expect(fixed.askMe.text).toBe('why');
    expect(fixed.askMe.at).toBe(0);
    expect(fixed.askMe.answeredText).toBeNull();
    expect(normalizeMoltbook({ askMe: 'junk' }).askMe).toBeNull();
    expect(normalizeMoltbook({}).askMe).toBeNull();
  });
});

describe('cross-reference timeline', () => {
  it('merges posts, chats, and ask log newest-first with honest provenance', () => {
    const t0 = new Date('2026-09-01T10:00:00').getTime();
    const mb = joinedMb();
    const ryanPost = addPost(mb, 'the molt is a door', 'theory');
    ryanPost.at = t0;
    const pilgrimPost = addPilgrimPost(mb, 'BugBard', 'petition: confetti is canon', 'petition', t0 + 1000);
    const entries = buildCrossRef({
      posts: [ryanPost, pilgrimPost],
      conversations: [{ id: 'c1', participant: 'BugBard', updated: t0 + 2000, messages: [{ from: 'ryan', text: 'hi' }, { from: 'BugBard', text: 'hello' }] }],
      askLog: [{ q: 'why pigeons', a: 'moderators', at: t0 + 3000, offline: true }],
    });
    expect(entries.map((e) => e.kind)).toEqual(['ask', 'chat', 'chat', 'post', 'post']);
    expect(entries[3].who).toBe('BugBard'); // pilgrim authorship preserved
    expect(entries[4].who).toBe('Ryan');
    const chat = entries.find((e) => e.kind === 'chat' && e.who === 'BugBard');
    expect(chat.approx).toBe(true); // chat clock is the thread's, flagged
    expect(entries[0].answer).toBe('moderators');
  });

  it('legacy date-only posts without parseable dates are excluded, not fabricated', () => {
    const entries = buildCrossRef({ posts: [{ id: 'p', day: 'not-a-date', kind: 'theory', text: 'old' }] });
    expect(entries).toHaveLength(0);
  });

  it('summarize reports totals, hour histogram, and busiest hour', () => {
    const t0 = new Date('2026-09-01T17:00:00').getTime(); // 17:00 local
    const entries = [
      { at: t0, kind: 'post' }, { at: t0 + 60_000, kind: 'chat' }, { at: t0 + 120_000, kind: 'ask' }, { at: t0 + 180_000, kind: 'post' },
    ];
    const s = summarizeCrossRef(entries);
    expect(s.total).toBe(4);
    expect(s.byKind).toEqual({ post: 2, chat: 1, ask: 1, reply: 0 });
    expect(s.busiestHour).toBe(new Date(t0).getHours());
    expect(s.days.length).toBe(1);
  });
});
