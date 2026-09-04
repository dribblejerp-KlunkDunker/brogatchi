// Tests for Ryan's pinning memory core: pinned milestones survive the cap,
// sort first, and toggle cleanly; save normalization backfills legacy ids.
import { describe, it, expect } from 'vitest';
import {
  remember, togglePin, capMemories, scrubPinnedMemories, mergePinnedMemories, MAX_MEMORIES,
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
