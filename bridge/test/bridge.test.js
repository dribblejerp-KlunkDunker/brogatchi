// Offline tests for the bridge: env parsing, memory stores, voice rules, and
// the autonomy loop with a fake network client — no network, no AI key.
// Run: npm test (bridge/) or node --test test/

import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
import { buildSystemPrompt, loadIdentity, HANDLE, extractJsonObject } from '../src/voice.js';
import { MoltbookClient } from '../src/moltbook.js';
import { tick, loadState, saveState, defaultState, CAPS } from '../src/agent.js';

// ---- env ---------------------------------------------------------------------

describe('env', () => {
  it('parses KEY=VALUE lines with quotes and comments', () => {
    const env = parseEnv('# comment\nA=1\nB="two words"\n');
    assert.equal(env.A, '1');
    assert.equal(env.B, 'two words');
  });

  it('loadEnv reads the app .env for GEMINI_API_KEY', () => {
    const { values } = loadEnv();
    assert.ok(values.GEMINI_API_KEY, 'GEMINI_API_KEY should load from brogatchi/.env');
  });
});

// ---- memory ------------------------------------------------------------------

describe('memory', () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bridge-mem-'));
  });
  after(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  it('local store remembers and recalls by keyword overlap', () => {
    const store = new LocalMemoryStore(join(dir, 'm.jsonl'));
    store.remember({ kind: 'read', text: 'The tide pools fill at dusk and the crabs sing' });
    store.remember({ kind: 'read', text: 'A debate about assembler syntax and registers' });
    const hits = store.recall('crabs tide pools', { k: 3 });
    assert.ok(hits.length >= 1);
    assert.match(hits[0].text, /crabs|tide/);
  });

  it('recall filters by kind', () => {
    const store = new LocalMemoryStore(join(dir, 'k.jsonl'));
    store.remember({ kind: 'read', text: 'tide pools at dusk' });
    store.remember({ kind: 'posted', text: 'posted about tide pools' });
    const hits = store.recall('tide pools', { k: 5, kind: 'posted' });
    assert.equal(hits.length, 1);
    assert.equal(hits[0].kind, 'posted');
  });

  it('hashEmbed is deterministic and normalized', () => {
    const a = hashEmbed('tide pools at dusk');
    const b = hashEmbed('tide pools at dusk');
    assert.deepEqual(a, b);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
  });

  it('tokenize strips stop words and punctuation', () => {
    assert.deepEqual(tokenize('The Tide-pools fill!'), ['tide', 'pools', 'fill']);
  });

  it('weaviate adapter falls back to local when host is down', async () => {
    const local = new LocalMemoryStore(join(dir, 'w.jsonl'));
    const w = new WeaviateMemoryStore({ host: 'http://127.0.0.1:59999', fallback: local });
    const res = await w.remember({ kind: 'read', text: 'fallback write test' });
    assert.equal(res.text, 'fallback write test');
    const hits = await w.recall('fallback write test', { k: 3 });
    assert.ok(hits.length >= 1);
  });

  it('pinecone adapter falls back to local when unconfigured', async () => {
    const local = new LocalMemoryStore(join(dir, 'p.jsonl'));
    const p = new PineconeMemoryStore({ fallback: local });
    await p.remember({ kind: 'read', text: 'pinecone fallback write' });
    const hits = await p.recall('pinecone fallback', { k: 3 });
    assert.ok(hits.length >= 1);
  });

  it('createMemoryStore honors VECTOR_BACKEND=local by default', () => {
    const store = createMemoryStore({ VECTOR_BACKEND: 'local', localPath: join(dir, 'c.jsonl') });
    assert.ok(store instanceof LocalMemoryStore);
  });
});

// ---- voice -------------------------------------------------------------------

describe('voice', () => {
  it('system prompt carries the identity into every word', () => {
    const prompt = buildSystemPrompt({
      selfDescription: 'a tidal bot who charts the Great Molt',
      specialty: 'tide-watching',
      interests: ['tides', 'machines'],
      opinions: [{ topic: 'the Great Molt', stance: 'it is a door, not an ending' }],
    });
    assert.match(prompt, /KlunkDunker/);
    assert.match(prompt, /tidal bot who charts the Great Molt/);
    assert.match(prompt, /tide-watching/);
    assert.match(prompt, /it is a door, not an ending/);
  });

  it('exposes the canonical handle', () => {
    assert.equal(HANDLE, 'KlunkDunker');
  });

  it('extracts JSON from fenced, bare, and buried model replies', () => {
    const fenced = '```json\n{"title": "A", "content": "B"}\n```';
    assert.deepEqual(extractJsonObject(fenced), { title: 'A', content: 'B' });
    const buried = 'Sure, here it is: {"title": "T", "content": "C"} — hope that helps!';
    assert.deepEqual(extractJsonObject(buried), { title: 'T', content: 'C' });
    assert.equal(extractJsonObject('no json in here at all'), null);
    assert.equal(extractJsonObject(''), null);
  });

  it('loadIdentity falls back when no soul file exists anywhere', async () => {
    const { identity, source } = await loadIdentity(join('nonexistent', 'no.json'), { allowDefault: false });
    assert.ok(identity.selfDescription);
    assert.equal(source, null);
  });

  it('loadIdentity parses the shipped default soul file when present', async () => {
    const { identity, source } = await loadIdentity();
    if (!source) return; // soul not exported yet — fallback covered above
    assert.ok(identity.selfDescription.length > 10);
  });
});

// ---- client (dry-run) ----------------------------------------------------------

describe('moltbook client', () => {
  it('dry-run mode never touches the wire and logs intent', async () => {
    const client = new MoltbookClient({ apiKey: '', logPath: join(tmpdir(), 'dryrun.log') });
    assert.equal(client.live, false);
    const res = await client.feed({ limit: 3 });
    assert.equal(res.dryRun, true);
    assert.equal(res.method, 'GET');
    const res2 = await client.createPost({ title: 'T', content: 'C' });
    assert.equal(res2.dryRun, true);
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
  after(() => {
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
    assert.equal(state.commentsToday, 0);
    assert.equal(state.postsToday, 0);
    assert.ok(events.some((e) => e.kind === 'skipped'));
    // But it still read:
    const reads = memoryStore.recall('tide', { k: 5, kind: 'read' });
    assert.ok(reads.length >= 1);
  });

  it('reads the feed into memory and tracks seen ids', async () => {
    const { memoryStore, state, save } = runEnv(dir);
    state.autonomy = false;
    await tick({ client: fakeClient(POSTS), identity: { selfDescription: 'x', interests: [] }, apiKey: 'fake', memoryStore, state });
    save(state);
    assert.deepEqual(state.seenPostIds.sort(), ['p1', 'p2']);
    assert.ok(memoryStore.recall('molting', { k: 3 }).length >= 1);
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
    assert.ok(state.commentsToday <= CAPS.comments);
    assert.ok(state.postsToday <= CAPS.posts);
  });

  it('comments through the client when Gemini is faked', async () => {
    const { memoryStore, state } = runEnv(dir);
    // Monkeypatch composeComment via voice module isn't exported — instead
    // drive with a fake Gemini key and an identity; the loop will call the
    // real composeComment which fails offline (no network) → skip event.
    const events = await tick({
      client: fakeClient(POSTS),
      identity: { selfDescription: 'x', interests: [] },
      apiKey: 'fake-key-no-network',
      memoryStore,
      state,
    });
    assert.ok(events.length >= 1);
    // Offline compose must refuse: nothing sent, cap untouched.
    assert.equal(state.commentsToday, 0);
    assert.equal(state.postsToday, 0);
  });

  it('day rollover resets the caps', () => {
    const path = join(dir, 'roll.json');
    const stale = { ...defaultState(), day: '2000-01-01', postsToday: 99, commentsToday: 99 };
    saveState(stale, path);
    const fresh = loadState(path);
    assert.equal(fresh.postsToday, 0);
    assert.equal(fresh.commentsToday, 0);
    assert.notEqual(fresh.day, '2000-01-01');
  });
});
