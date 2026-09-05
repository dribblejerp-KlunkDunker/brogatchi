// Tests for Ryan's pinning memory core: pinned milestones survive the cap,
// sort first, and toggle cleanly; save normalization backfills legacy ids.
import { describe, it, expect } from 'vitest';
import {
  remember, rememberWithArchive, archiveMemories, recallArchive, togglePin, capMemories,
  scrubPinnedMemories, mergePinnedMemories, MAX_MEMORIES, MAX_ARCHIVE, ARCHIVE_VIEW,
} from '../src/core/memory.js';
import { normalize } from '../src/core/save.js';

const mem = (id, imp, pinned) => ({ id, icon: '🪙', text: `m-${id}`, imp, ...(pinned ? { pinned: true } : {}) });

describe('memory pinning', () => {
  it('pins a memory and sorts pinned first', () => {
    let list = remember([], { text: 'noise', imp: 5 });
    list = remember(list, { text: 'milestone', imp: 4, pin: true });
    expect(list[0].pinned).toBe(true);
    expect(list[0].text).toBe('milestone');
    expect(list[0].id).toBeTruthy();
  });

  it('never evicts pinned entries when the cap overflows', () => {
    let list = [mem('p1', 4, true)];
    for (let i = 0; i < MAX_MEMORIES + 6; i++) list = remember(list, { text: `filler ${i}`, imp: 5 });
    expect(list.length).toBe(MAX_MEMORIES);
    expect(list.filter((m) => m.pinned).map((m) => m.id)).toEqual(['p1']);
  });

  it('keeps everything when under the cap', () => {
    const list = capMemories([mem('a', 5, true), mem('b', 5, true), mem('c', 3), mem('d', 2)]);
    expect(list.length).toBe(4);
    const full = capMemories(Array.from({ length: MAX_MEMORIES + 3 }, (_, i) => mem(`u${i}`, 5)));
    expect(full.length).toBe(MAX_MEMORIES);
  });

  it('togglePin flips and re-sorts; unknown ids are no-ops', () => {
    let list = [mem('x', 2), mem('y', 5)];
    list = togglePin(list, 'x');
    expect(list.find((m) => m.id === 'x').pinned).toBe(true);
    expect(list[0].id).toBe('x'); // pinned first despite lower importance
    list = togglePin(list, 'x');
    expect(list.find((m) => m.id === 'x').pinned).toBeFalsy();
    expect(list[0].id).toBe('y'); // back to importance order
    const before = togglePin(list, 'nope');
    expect(before.map((m) => m.id)).toEqual(list.map((m) => m.id));
  });

  it('save normalization backfills legacy ids and repairs junk', () => {
    const out = normalize({ memories: [{ icon: 'x', text: 'legacy', imp: 3 }, null, { text: 42 }] });
    expect(out.memories.length).toBe(1);
    expect(out.memories[0].id).toBeTruthy();
    const again = normalize({ memories: out.memories });
    expect(again.memories[0].id).toBe(out.memories[0].id); // id stable across loads
  });

  it('scrubPinnedMemories sanitizes an external list and forces pinned', () => {
    expect(scrubPinnedMemories('nope')).toEqual([]);
    expect(scrubPinnedMemories(null)).toEqual([]);
    expect(scrubPinnedMemories([{}])).toEqual([]);
    const out = scrubPinnedMemories([
      { text: 'good', imp: 9, junk: 'x' },
      { text: '   ' },
      42,
      null,
      { id: 'keep', text: 'with id', imp: 0 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.pinned)).toBe(true);
    expect(out.find((m) => m.text === 'good').imp).toBe(5); // clamped to max
    expect(out.find((m) => m.text === 'with id').id).toBe('keep');
    expect(out.find((m) => m.text === 'good').id).toBeTruthy(); // id backfilled
  });

  it('mergePinnedMemories unions deduped by text, local slots win, all stay pinned', () => {
    const local = scrubPinnedMemories([{ text: 'shared milestone', imp: 4 }, { text: 'local only', imp: 3 }]);
    const incoming = scrubPinnedMemories([{ text: 'shared milestone', imp: 5 }, { text: 'imported only', imp: 4 }]);
    const merged = mergePinnedMemories(local, incoming);
    expect(merged).toHaveLength(3);
    expect(merged.find((m) => m.text === 'shared milestone').imp).toBe(4); // local wins the slot
    expect(merged.map((m) => m.text)).toEqual(expect.arrayContaining(['local only', 'imported only']));
    expect(merged.every((m) => m.pinned)).toBe(true);
    expect(mergePinnedMemories(null, 'bad')).toEqual([]);
  });
});

// ---- Long-term archive: evicted memories live on ---------------------------

describe('memory archive', () => {
  const fill = (n, pinnedEvery = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: `m${String(i).padStart(3, '0')}`, icon: '🪙', text: `memory number ${i}`, imp: 2, ...(pinnedEvery && i % pinnedEvery === 0 ? { pinned: true } : {}) }));

  it('rememberWithArchive preserves cap evictions instead of deleting them', () => {
    const before = fill(MAX_MEMORIES + 3); // 3 will churn out
    const res = rememberWithArchive(before, [], { icon: '🪙', text: 'a fresh thought', imp: 2 });
    expect(res.memories).toHaveLength(MAX_MEMORIES);
    expect(res.evicted).toHaveLength(3);
    expect(res.archive.map((m) => m.text)).toContain('memory number 0');
    expect(res.archive).toHaveLength(3);
    // Everything archived carries its shelf stamp.
    expect(res.archive.every((m) => typeof m.archivedAt === 'number')).toBe(true);
  });

  it('pinned memories never evict, so they never archive', () => {
    const before = fill(MAX_MEMORIES, 10); // every 10th pinned
    const res = rememberWithArchive(before, [], { text: 'newest', imp: 2 });
    expect(res.evicted.every((m) => !m.pinned)).toBe(true);
    expect(res.archive.every((m) => !m.pinned)).toBe(true);
  });

  it('dedupes by text and caps the shelf at MAX_ARCHIVE', () => {
    const dupes = [{ id: 'x1', icon: '🪙', text: 'seen that', imp: 2 }, { id: 'x2', icon: '🪙', text: 'seen that', imp: 2 }];
    let shelf = archiveMemories([], dupes);
    expect(shelf).toHaveLength(1);
    shelf = archiveMemories(shelf, dupes);
    expect(shelf).toHaveLength(1); // normalize sweep re-adds never double
    const pile = Array.from({ length: MAX_ARCHIVE + 20 }, (_, i) => ({ id: `a${i}`, icon: '🪙', text: `old thing ${i}`, imp: 1 }));
    expect(archiveMemories([], pile)).toHaveLength(MAX_ARCHIVE);
  });

  it('recallArchive ranks by keyword hits then recency, empty query returns newest', () => {
    const shelf = archiveMemories([], [
      { id: '1', icon: '🪙', text: 'the pigeon pilot flew at dawn', imp: 2 },
      { id: '2', icon: '🪙', text: 'a pigeon met a pigeon at dawn', imp: 2 },
      { id: '3', icon: '🪙', text: 'totally unrelated crustacean gossip', imp: 2 },
    ]);
    const hits = recallArchive(shelf, 'pigeon');
    expect(hits).toHaveLength(2);
    expect(hits[0].text).toBe('a pigeon met a pigeon at dawn'); // 2 occurrences beat 1
    expect(recallArchive(shelf, '').map((m) => m.id)).toEqual(shelf.slice(0, ARCHIVE_VIEW).map((m) => m.id));
    expect(recallArchive(shelf, 'zzz')).toHaveLength(0);
    expect(recallArchive(shelf, 'pigeon', 1)).toHaveLength(1);
  });

  it('normalize sweeps over-cap memories into the archive on load (legacy repair)', () => {
    const s = { version: 4, memories: fill(MAX_MEMORIES + 2), moltbook: { joined: true } };
    const out = normalize(s);
    expect(out.memories).toHaveLength(MAX_MEMORIES);
    expect(out.memoryArchive).toHaveLength(2);
    // Idempotent across reloads: nothing new evicts, nothing duplicates.
    const again = normalize({ ...out, moltbook: out.moltbook });
    expect(again.memoryArchive).toHaveLength(2);
    expect(again.memories).toHaveLength(MAX_MEMORIES);
  });

  it('normalize defaults the archive for fresh/legacy saves', () => {
    expect(normalize({ version: 4 }).memoryArchive).toEqual([]);
    expect(Array.isArray(normalize({ version: 4, memoryArchive: 'junk' }).memoryArchive)).toBe(true);
  });
});
