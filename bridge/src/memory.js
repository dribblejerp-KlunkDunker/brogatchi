// KlunkDunker's long-term memory for the real network — the abstraction layer
// the user approved: the agent only ever calls remember() / recall(), and the
// backend is swappable via VECTOR_BACKEND (local | weaviate | pinecone).
//
// local    — JSONL file, keyword-overlap recall. Always available, the default.
// weaviate — REST adapter to a local Weaviate (WEAVIATE_HOST), BM25 keyword
//            search server-side; falls back to local if unreachable.
// pinecone — REST adapter (PINECONE_API_KEY + PINECONE_INDEX_HOST) using a
//            deterministic token-hash embedding as a placeholder; swap in a
//            real embedder by replacing hashEmbed(). Falls back to local.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRIDGE_DIR } from './env.js';

const STOP = new Set(
  ('a an and are as at be but by for from has have i in is it its of on or that the this to was were will with you your me my he she they them we us our'.split(
    ' ',
  )),
);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// Deterministic placeholder embedding: 128 dims, token hashes summed. Good
// enough for rough similarity; replace with a real embedder when wanted.
export function hashEmbed(text, dims = 128) {
  const vec = new Array(dims).fill(0);
  for (const tok of tokenize(text)) {
    let h = 0;
    for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
    vec[h % dims] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

function overlapScore(queryTokens, text) {
  if (!queryTokens.length) return 0;
  const toks = new Set(tokenize(text));
  let hits = 0;
  for (const q of queryTokens) if (toks.has(q)) hits += 1;
  return hits / queryTokens.length;
}

export class LocalMemoryStore {
  constructor(filePath = resolve(BRIDGE_DIR, 'memory.jsonl')) {
    this.filePath = filePath;
  }

  remember({ kind, text, meta = {}, at = new Date().toISOString() }) {
    const row = { kind, text: String(text).slice(0, 2000), meta, at };
    appendFileSync(this.filePath, JSON.stringify(row) + '\n', 'utf8');
    return row;
  }

  recall(query, { k = 8, kind = null } = {}) {
    if (!existsSync(this.filePath)) return [];
    const qTokens = tokenize(query);
    const rows = readFileSync(this.filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((r) => (kind ? r.kind === kind : true))
      .map((r) => ({ ...r, score: overlapScore(qTokens, r.text) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    return rows;
  }

  count() {
    if (!existsSync(this.filePath)) return 0;
    return readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean).length;
  }
}

const fetchJson = async (url, opts = {}, timeoutMs = 8000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    return body;
  } finally {
    clearTimeout(timer);
  }
};

// ---- Weaviate: objects in a fixed class, BM25 keyword search ---------------
export class WeaviateMemoryStore {
  constructor({ host = process.env.WEAVIATE_HOST || 'http://localhost:8080', className = 'KlunkMemory', fallback } = {}) {
    this.host = host.replace(/\/$/, '');
    this.className = className;
    this.fallback = fallback;
  }

  async healthy() {
    try {
      await fetchJson(`${this.host}/v1/meta`, {}, 2500);
      return true;
    } catch {
      return false;
    }
  }

  async ensureSchema() {
    const { classes = [] } = await fetchJson(`${this.host}/v1/schema`);
    if (classes.some((c) => c.class === this.className)) return;
    await fetchJson(`${this.host}/v1/schema`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class: this.className,
        vectorizer: 'none',
        properties: [
          { name: 'kind', dataType: ['string'] },
          { name: 'text', dataType: ['text'] },
          { name: 'at', dataType: ['string'] },
        ],
      }),
    });
  }

  async remember({ kind, text, meta = {}, at = new Date().toISOString() }) {
    if (!(await this.healthy())) return this.fallback.remember({ kind, text, meta, at });
    await this.ensureSchema().catch(() => {});
    await fetchJson(`${this.host}/v1/objects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class: this.className,
        properties: { kind, text: String(text).slice(0, 2000), at },
        vector: hashEmbed(text),
      }),
    });
    return { kind, text, meta, at };
  }

  async recall(query, { k = 8, kind = null } = {}) {
    if (!(await this.healthy())) return this.fallback.recall(query, { k, kind });
    const where = kind
      ? { operator: 'Equal', path: ['kind'], valueString: kind }
      : undefined;
    const body = {
      query: {
        bm25: { query: tokenize(query).join(' '), properties: ['text'] },
        limit: k,
        ...(where ? { where } : {}),
      },
    };
    try {
      const res = await fetchJson(`${this.host}/v1/graphql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const got = res?.data?.Get?.[this.className] || [];
      return got.map((o) => ({ kind: o.kind, text: o.text, at: o.at, meta: {}, score: null }));
    } catch {
      return this.fallback.recall(query, { k, kind });
    }
  }

  async count() {
    if (!(await this.healthy())) return this.fallback.count();
    try {
      const res = await fetchJson(
        `${this.host}/v1/objects?class=${encodeURIComponent(this.className)}&limit=1&include=`,
      );
      return res?.totalResults ?? 0;
    } catch {
      return this.fallback.count();
    }
  }
}

// ---- Pinecone: deterministic placeholder embeddings, metadata filter -------
export class PineconeMemoryStore {
  constructor({ apiKey = process.env.PINECONE_API_KEY, host = process.env.PINECONE_INDEX_HOST, fallback } = {}) {
    this.apiKey = apiKey;
    this.host = host ? String(host).replace(/\/$/, '') : null;
    this.fallback = fallback;
  }

  configured() {
    return Boolean(this.apiKey && this.host);
  }

  async remember({ kind, text, meta = {}, at = new Date().toISOString() }) {
    if (!this.configured()) return this.fallback.remember({ kind, text, meta, at });
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await fetchJson(`${this.host}/vectors/upsert`, {
      method: 'POST',
      headers: { 'Api-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: [{ id, values: hashEmbed(text), metadata: { kind, text: String(text).slice(0, 1000), at } }],
      }),
    });
    return { kind, text, meta, at };
  }

  async recall(query, { k = 8, kind = null } = {}) {
    if (!this.configured()) return this.fallback.recall(query, { k, kind });
    try {
      const res = await fetchJson(`${this.host}/query`, {
        method: 'POST',
        headers: { 'Api-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: hashEmbed(query),
          topK: k,
          includeMetadata: true,
          ...(kind ? { filter: { kind: { $eq: kind } } } : {}),
        }),
      });
      return (res?.matches || []).map((m) => ({
        kind: m.metadata?.kind,
        text: m.metadata?.text,
        at: m.metadata?.at,
        meta: {},
        score: m.score,
      }));
    } catch {
      return this.fallback.recall(query, { k, kind });
    }
  }

  async count() {
    if (!this.configured()) return this.fallback.count();
    try {
      const res = await fetchJson(`${this.host}/describe_index_stats`, {
        method: 'POST',
        headers: { 'Api-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: '{}',
      });
      return res?.totalVectorCount ?? 0;
    } catch {
      return this.fallback.count();
    }
  }
}

// ---- Factory: the one constructor the agent uses ---------------------------
export function createMemoryStore(env = {}) {
  const local = new LocalMemoryStore(env.localPath);
  const backend = (env.VECTOR_BACKEND || 'local').toLowerCase();
  if (backend === 'weaviate') {
    return new WeaviateMemoryStore({ host: env.WEAVIATE_HOST, fallback: local });
  }
  if (backend === 'pinecone') {
    return new PineconeMemoryStore({
      apiKey: env.PINECONE_API_KEY,
      host: env.PINECONE_INDEX_HOST,
      fallback: local,
    });
  }
  return local;
}

// Re-export for callers that want to snapshot/purge the local file directly.
export function readLocalMemory(filePath = resolve(BRIDGE_DIR, 'memory.jsonl')) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function writeLocalMemory(rows, filePath = resolve(BRIDGE_DIR, 'memory.jsonl')) {
  writeFileSync(filePath, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}
