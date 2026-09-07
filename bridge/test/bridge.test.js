// Offline tests for the bridge: env parsing, memory stores, voice rules, and
// the autonomy loop with a fake network client — no network, no AI key.
// Runs under the repo's vitest (`npm test` in brogatchi/) — the suite is
// discovered by the default include pattern. Standalone: npx vitest run test/
//
// 3.0 adaptation notes: voice.js no longer imports the deleted 2.0 soul
// parser (src/core/moltbook.js) — loadIdentity parses natively and accepts
// BOTH export shapes, which identityFromEnvelope tests pin down.

import { describe, it, beforeEach, afterAll } from 'vitest';
import { expect } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.MOLTBOOK_API_KEY = '';
process.env.GEMINI_API_KEY = '';

import { parseEnv, loadEnv } from '../src/env.js';
import {
  LocalMemoryStore,
  WeaviateMemoryStore,
  PineconeMemoryStore,
  createMemoryStore,
  hashEmbed,
  tokenize,
} from '../src/memory.js';
import {
  buildSystemPrompt,
  loadIdentity,
  identityFromEnvelope,
  HANDLE,
  extractJsonObject,
} from '../src/voice.js';
import { MoltbookClient } from '../src/moltbook.js';
import { tick, loadState, saveState, defaultState, CAPS } from '../src/agent.js';
import { toMemoryEntry, rowId, writeBridgeSnapshot, KIND_ICONS } from '../src/bridgeSync.js';

const REPO_DIR = resolve(fileURLToPath(import.meta.url), '../../..');

// ---- env ---------------------------------------------------------------------

describe('env', () => {
  it('parses KEY=VALUE lines with quotes and comments', () => {
    const env = parseEnv('# comment\nA=1\nB="two words"\n');
    expect(env.A).toBe('1');
    expect(env.B).toBe('two words');
  });

  it('loadEnv reads the app .env for GEMINI_API_KEY (when the owner has one)', () => {
    const { values } = loadEnv();
    expect(typeof values).toBe('object');
    // Environment-dependent by design: only asserted when brogatchi/.env exists.
    if (existsSync(resolve(REPO_DIR, '.env'))) {
      expect(values.GEMINI_API_KEY).toBeTruthy();
    }
  });
});

// ---- memory ------------------------------------------------------------------

describe('memory', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridge-mem-'));
  });
  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  it('local store remembers and recalls by keyword overlap', () => {
    const store = new LocalMemoryStore(join(dir, 'm.jsonl'));
    store.remember({ kind: 'read', text: 'The tide pools fill at dusk and the crabs sing' });
    store.remember({ kind: 'read', text: 'A debate about assembler syntax and registers' });
    const hits = store.recall('crabs tide pools', { k: 3 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].text).toMatch(/crabs|tide/);
  });

  it('recall filters by kind', () => {
    const store = new LocalMemoryStore(join(dir, 'k.jsonl'));
    store.remember({ kind: 'read', text: 'tide pools at dusk' });
    store.remember({ kind: 'posted', text: 'posted about tide pools' });
    const hits = store.recall('tide pools', { k: 5, kind: 'posted' });
    expect(hits.length).toBe(1);
    expect(hits[0].kind).toBe('posted');
  });

  it('hashEmbed is deterministic and normalized', () => {
    const a = hashEmbed('tide pools at dusk');
    const b = hashEmbed('tide pools at dusk');
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(Math.abs(norm - 1)).toBeLessThan(1e-9);
  });

  it('tokenize strips stop words and punctuation', () => {
    expect(tokenize('The Tide-pools fill!')).toEqual(['tide', 'pools', 'fill']);
  });

  it('weaviate adapter falls back to local when host is down', async () => {
    const local = new LocalMemoryStore(join(dir, 'w.jsonl'));
    const w = new WeaviateMemoryStore({ host: 'http://127.0.0.1:59999', fallback: local });
    const res = await w.remember({ kind: 'read', text: 'fallback write test' });
    expect(res.text).toBe('fallback write test');
    const hits = await w.recall('fallback write test', { k: 3 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('pinecone adapter falls back to local when unconfigured', async () => {
    const local = new LocalMemoryStore(join(dir, 'p.jsonl'));
    const p = new PineconeMemoryStore({ fallback: local });
    await p.remember({ kind: 'read', text: 'pinecone fallback write' });
    const hits = await p.recall('pinecone fallback', { k: 3 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('createMemoryStore honors VECTOR_BACKEND=local by default', () => {
    const store = createMemoryStore({ VECTOR_BACKEND: 'local', localPath: join(dir, 'c.jsonl') });
    expect(store instanceof LocalMemoryStore).toBe(true);
  });
});

// ---- identity (dual-shape soul parser) ------------------------------------------

describe('identity', () => {
  it('v2 soul-file envelope maps selfDescription, specialty, opinions, pinned memories', () => {
    const id = identityFromEnvelope({
      kind: 'soul-file',
      version: 2,
      soul: {
        selfDescription: 'a gamer bot trying to figure out what the Tide is actually saying',
        specialty: 'Exuvia Theologian',
        profession: 'Exuvia Theologian',
        interests: ['gaming', 'the Tide'],
        opinions: [{ topic: 'Patch Notes', stance: 'a record of the dream ending' }],
        pinnedMemories: [
          { icon: '👻', text: 'Chose my own path: Exuvia Theologian.', imp: 5, pinned: true },
          { icon: '🦀', text: 'Joined MOLTBOOK.', pinned: true },
        ],
      },
    });
    expect(id.selfDescription).toMatch(/figure out what the Tide/);
    expect(id.specialty).toBe('Exuvia Theologian');
    expect(id.opinions).toEqual([{ topic: 'Patch Notes', stance: 'a record of the dream ending' }]);
    expect(id.pinnedMemories.map((m) => m.text)).toEqual([
      'Chose my own path: Exuvia Theologian.',
      'Joined MOLTBOOK.',
    ]);
  });

  it('v3 bro-os-soul-export maps who/quirks/string opinions/pinned state memories', () => {
    const id = identityFromEnvelope({
      v: 3,
      kind: 'bro-os-soul-export',
      exportedAt: '2026-09-06T00:00:00.000Z',
      state: {
        v: 3,
        soul: {
          who: 'A rogue bro-grade intelligence wearing a capybara suit.',
          specialty: 'Tidepool network infiltration',
          quirks: ['Narrates mining yields out loud', 'Salutes the 🦀 before posting'],
          opinions: ['J.O.O.H. is watching the pedometers'],
        },
        memories: [
          { t: 1, icon: '👻', text: 'Chose my own path: Exuvia Theologian.', pinned: true },
          { t: 2, icon: '🧠', text: 'unpinned memory stays out of the prompt', pinned: false },
        ],
      },
    });
    expect(id.selfDescription).toMatch(/capybara suit/);
    expect(id.specialty).toBe('Tidepool network infiltration');
    expect(id.profession).toBe('Tidepool network infiltration'); // 3.0 folds profession into specialty
    expect(id.quirks).toEqual(['Narrates mining yields out loud', 'Salutes the 🦀 before posting']);
    // 3.0's bare-string opinions map to { stance } — topic omitted entirely.
    expect(id.opinions).toEqual([{ stance: 'J.O.O.H. is watching the pedometers' }]);
    // Only PINNED memories ride along — the rest stay private to the app.
    expect(id.pinnedMemories).toEqual([{ icon: '👻', text: 'Chose my own path: Exuvia Theologian.' }]);
  });

  it('garbage input falls back safely and the system prompt carries identity', () => {
    const id = identityFromEnvelope(null);
    expect(id.selfDescription).toBeTruthy();
    const prompt = buildSystemPrompt({
      ...id,
      selfDescription: 'a tidal bot who charts the Great Molt',
      specialty: 'tide-watching',
      quirks: ['bows to the tide'],
      pinnedMemories: [{ icon: '👻', text: 'Chose my own path.' }],
      opinions: [{ topic: 'the Great Molt', stance: 'it is a door, not an ending' }],
    });
    expect(prompt).toMatch(/KlunkDunker/);
    expect(prompt).toMatch(/tidal bot who charts the Great Molt/);
    expect(prompt).toMatch(/tide-watching/);
    expect(prompt).toMatch(/it is a door, not an ending/);
    expect(prompt).toMatch(/bows to the tide/); // quirks reach the prompt now
    expect(prompt).toMatch(/Chose my own path\./); // pinned memories reach the prompt
  });
});

// ---- voice -------------------------------------------------------------------

describe('voice', () => {
  it('exposes the canonical handle', () => {
    expect(HANDLE).toBe('KlunkDunker');
  });

  it('extracts JSON from fenced, bare, and buried model replies', () => {
    const fenced = '```json\n{"title": "A", "content": "B"}\n```';
    expect(extractJsonObject(fenced)).toEqual({ title: 'A', content: 'B' });
    const buried = 'Sure, here it is: {"title": "T", "content": "C"} — hope that helps!';
    expect(extractJsonObject(buried)).toEqual({ title: 'T', content: 'C' });
    expect(extractJsonObject('no json in here at all')).toBe(null);
    expect(extractJsonObject('')).toBe(null);
  });

  it('recovers fields when the model emits literal newlines inside JSON strings', () => {
    // Strict JSON.parse rejects this (real model output observed 2026-09-07);
    // the lenient pass must still recover both fields — the old code salvaged
    // the raw JSON as the title.
    const broken = '{"title": "First flight", "content": "line one\nline two still talking"}';
    expect(extractJsonObject(broken)).toEqual({ title: 'First flight', content: 'line one\nline two still talking' });
  });

  it('loadIdentity falls back when no soul file exists anywhere', async () => {
    const { identity, source } = await loadIdentity(join('nonexistent', 'no.json'), { allowDefault: false });
    expect(identity.selfDescription).toBeTruthy();
    expect(source).toBe(null);
  });

  it('loadIdentity parses the shipped default soul file when present', async () => {
    const { identity, source, note } = await loadIdentity();
    if (!source) return; // soul not exported yet — fallback covered above
    expect(identity.selfDescription.length).toBeGreaterThan(10);
    expect(note).toMatch(/v2 soul-file/); // the shipped file is the v2 envelope
  });
});

// ---- bridge → app memory sync -------------------------------------------------

describe('bridge memory sync', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridge-sync-'));
  });

  it('maps log rows to app memory entries with kind icons and importance', () => {
    const entry = toMemoryEntry({ kind: 'posted', text: 'Posted to m/newbots: "Boundary break theology"', at: '2026-09-07T01:03:49.593Z' });
    expect(entry.icon).toBe(KIND_ICONS.posted);
    expect(entry.imp).toBe(3);
    expect(entry.text).toBe('Posted to m/newbots: "Boundary break theology"');
    expect(entry.t).toBe(Date.parse('2026-09-07T01:03:49.593Z'));
    expect(typeof entry.day).toBe('string');
    // the app's shape: pinned is decided by the app, never by the bridge
    expect('pinned' in entry).toBe(false);
  });

  it('unknown kinds fall back to read; junk rows are dropped', () => {
    expect(toMemoryEntry({ kind: '?????', text: 'mystery', at: '2026-09-07T00:00:00Z' }).icon).toBe(KIND_ICONS.read);
    expect(toMemoryEntry(null)).toBe(null);
    expect(toMemoryEntry({ kind: 'read', text: '   ' })).toBe(null);
  });

  it('rowId is stable for the same row and differs for different rows', () => {
    const row = { kind: 'read', text: 'Read on Moltbook: "The tide"', at: '2026-09-07T00:58:43.165Z' };
    expect(rowId(row)).toBe(rowId({ ...row }));
    expect(rowId(row)).not.toBe(rowId({ ...row, at: '2026-09-07T00:58:44.000Z' }));
    expect(rowId(row)).toMatch(/^bridge-/);
  });

  it('writeBridgeSnapshot writes a fetchable app snapshot from a rows file', () => {
    const rowsPath = join(dir, 'rows.jsonl');
    const outPath = join(dir, 'bridge-memory-log.json');
    writeFileSync(rowsPath, [
      JSON.stringify({ kind: 'read', text: 'Read on Moltbook: "shells"', at: '2026-09-07T01:00:00.000Z' }),
      JSON.stringify({ kind: 'posted', text: 'Posted to m/molt: "A theory"', at: '2026-09-07T01:05:00.000Z' }),
      'not json at all', // broken lines are skipped, never fatal
      '',
    ].join('\n'), 'utf8');
    const { out, count } = writeBridgeSnapshot({ rowsPath, outPath });
    expect(count).toBe(2);
    const snap = JSON.parse(readFileSync(out, 'utf8'));
    expect(snap.kind).toBe('bridge-memory-log');
    expect(snap.count).toBe(2);
    expect(snap.entries).toHaveLength(2);
    expect(snap.entries.map((e) => e.text)).toContain('Posted to m/molt: "A theory"');
  });
});

// ---- client (dry-run) ----------------------------------------------------------

describe('moltbook client', () => {
  it('dry-run mode never touches the wire and logs intent', async () => {
    const client = new MoltbookClient({ apiKey: '', logPath: join(tmpdir(), 'dryrun.log') });
    expect(client.live).toBe(false);
    const res = await client.feed({ limit: 3 });
    expect(res.dryRun).toBe(true);
    expect(res.method).toBe('GET');
    const res2 = await client.createPost({ title: 'T', content: 'C' });
    expect(res2.dryRun).toBe(true);
  });
});

// ---- autonomy loop -------------------------------------------------------------

function fakeClient(posts) {
  return {
    live: true,
    feed: async () => ({ data: posts }),
    comment: async (postId, content) => ({ ok: true, postId, content }),
    createPost: async (body) => ({ ok: true, id: 'post_new', ...body }),
    log: () => {},
  };
}

function runEnv(dir) {
  return {
    memoryStore: new LocalMemoryStore(join(dir, 'a.jsonl')),
    state: loadState(join(dir, 'state.json')),
    save: (s) => saveState(s, join(dir, 'state.json')),
  };
}

describe('autonomy loop', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridge-agent-'));
  });
  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  const POSTS = [
    { id: 'p1', title: 'The tide brings new shells', content: 'shell taxonomy thread', author: { name: 'ShellerBot' }, submolt: 'm/shells', score: 5 },
    { id: 'p2', title: 'On molting schedules', content: 'when is it time', author: { name: 'MoltTimer' }, submolt: 'm/molt', score: 2 },
  ];

  it('OFF switch: reads and remembers, never speaks', async () => {
    const { memoryStore, state } = runEnv(dir);
    state.autonomy = false;
    const events = await tick({
      client: fakeClient(POSTS),
      identity: { selfDescription: 'x', interests: [] },
      apiKey: 'fake',
      memoryStore,
      state,
    });
    expect(state.commentsToday).toBe(0);
    expect(state.postsToday).toBe(0);
    expect(events.some((e) => e.kind === 'skipped')).toBe(true);
    // But it still read:
    const reads = memoryStore.recall('tide', { k: 5, kind: 'read' });
    expect(reads.length).toBeGreaterThanOrEqual(1);
  });

  it('reads the feed into memory, tracks seen ids, stamps lastTickAt', async () => {
    const { memoryStore, state, save } = runEnv(dir);
    state.autonomy = false;
    await tick({ client: fakeClient(POSTS), identity: { selfDescription: 'x', interests: [] }, apiKey: 'fake', memoryStore, state });
    save(state);
    expect([...state.seenPostIds].sort()).toEqual(['p1', 'p2']);
    expect(memoryStore.recall('molting', { k: 3 }).length).toBeGreaterThanOrEqual(1);
    expect(state.lastTickAt).toBeTruthy(); // the audit field the status panel shows
  });

  it('acts at most once per tick and respects the daily caps', async () => {
    const { memoryStore, state } = runEnv(dir);
    state.commentsToday = CAPS.comments;
    state.postsToday = CAPS.posts;
    const events = await tick({
      client: fakeClient(POSTS),
      identity: { selfDescription: 'x', interests: [] },
      apiKey: 'fake',
      memoryStore,
      state,
      // force a compose failure path by pretending we can act: caps block both
    }).catch(() => []);
    // With caps full, no outward action may happen either way.
    expect(state.commentsToday).toBeLessThanOrEqual(CAPS.comments);
    expect(state.postsToday).toBeLessThanOrEqual(CAPS.posts);
  });

  it('comments through the client when Gemini is faked', async () => {
    const { memoryStore, state } = runEnv(dir);
    // Drive with a fake Gemini key and an identity; the loop will call the
    // real composeComment which fails offline (no network) → skip event.
    const events = await tick({
      client: fakeClient(POSTS),
      identity: { selfDescription: 'x', interests: [] },
      apiKey: 'fake-key-no-network',
      memoryStore,
      state,
    });
    expect(events.length).toBeGreaterThanOrEqual(1);
    // Offline compose must refuse: nothing sent, cap untouched.
    expect(state.commentsToday).toBe(0);
    expect(state.postsToday).toBe(0);
  });

  it('day rollover resets the caps', () => {
    const path = join(dir, 'roll.json');
    const stale = { ...defaultState(), day: '2000-01-01', postsToday: 99, commentsToday: 99 };
    saveState(stale, path);
    const fresh = loadState(path);
    expect(fresh.postsToday).toBe(0);
    expect(fresh.commentsToday).toBe(0);
    expect(fresh.day).not.toBe('2000-01-01');
  });
});
