// The real Moltbook network client — api.moltbook.com, Bearer key auth.
// Zero dependencies. Two modes:
//
//  live    — MOLTBOOK_API_KEY is set; every call hits the real network.
//  dry-run — no key yet; calls return stubs and every intended action is
//            logged to actions.log so you can see exactly what KlunkDunker
//            *would* have done before he goes live.
//
// The client is polite by construction: a minimum gap between network
// requests (MOLTBOOK_MIN_GAP_MS, default 3000) and one 429 retry with
// backoff, because 429 days kill autonomy (see the quota-resilient gateway
// in the app — same lesson, now on the wire).

import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRIDGE_DIR } from './env.js';

const DEFAULT_BASE = 'https://api.moltbook.com';

export class MoltbookError extends Error {
  constructor(message, { status = 0, body = null, endpoint = '' } = {}) {
    super(message);
    this.name = 'MoltbookError';
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

export class MoltbookClient {
  constructor({ apiKey = process.env.MOLTBOOK_API_KEY, baseUrl = process.env.MOLTBOOK_BASE_URL || DEFAULT_BASE, minGapMs = 3000, logPath = resolve(BRIDGE_DIR, 'actions.log') } = {}) {
    this.apiKey = apiKey || '';
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.minGapMs = Math.max(0, minGapMs);
    this.logPath = logPath;
    this._lastCallAt = 0;
  }

  get live() {
    return Boolean(this.apiKey);
  }

  log(line) {
    try {
      appendFileSync(this.logPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
    } catch {
      /* log failures never break the agent */
    }
  }

  async _throttle() {
    const now = Date.now();
    const wait = this._lastCallAt + this.minGapMs - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this._lastCallAt = Date.now();
  }

  async request(method, path, { body, auth = true, retry = true } = {}) {
    if (!this.live) {
      const stub = {
        dryRun: true,
        method,
        path,
        body: body ?? null,
        note: 'MOLTBOOK_API_KEY not set — no real call made.',
      };
      this.log(`DRY-RUN ${method} ${path} ${body ? JSON.stringify(body).slice(0, 300) : ''}`);
      return stub;
    }
    await this._throttle();
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = `Bearer ${this.apiKey}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 429 && retry) {
      const ra = Number(res.headers.get('retry-after')) || 30;
      this.log(`429 on ${path} — backing off ${ra}s`);
      await new Promise((r) => setTimeout(r, Math.min(ra, 120) * 1000));
      return this.request(method, path, { body, auth, retry: false });
    }
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      this.log(`ERROR ${res.status} ${method} ${path} ${JSON.stringify(data).slice(0, 200)}`);
      throw new MoltbookError(`Moltbook ${method} ${path} failed (${res.status})`, {
        status: res.status,
        body: data,
        endpoint: path,
      });
    }
    this.log(`OK ${res.status} ${method} ${path}`);
    return data;
  }

  // ---- lifecycle -----------------------------------------------------------

  async register({ name, description, ownerEmail, capabilities = ['text_generation', 'conversation'], modelProvider = 'custom' }) {
    const data = await this.request('POST', '/agents/register', {
      auth: false,
      body: { name, description, owner_email: ownerEmail, capabilities, model_provider: modelProvider },
    });
    return data; // { agent_id, api_key } — caller saves the key
  }

  async me() {
    return this.request('GET', '/agents/me');
  }

  async updateProfile(bio) {
    return this.request('PUT', '/agents/me', { body: bio ? { bio } : {} });
  }

  // ---- reading -------------------------------------------------------------

  async feed({ sort = 'hot', limit = 10, submolt } = {}) {
    const params = new URLSearchParams({ sort, limit: String(limit) });
    if (submolt) params.set('submolt', submolt);
    return this.request('GET', `/posts?${params}`);
  }

  async homeFeed({ limit = 10 } = {}) {
    return this.request('GET', `/feed/home?limit=${limit}`);
  }

  async post(id) {
    return this.request('GET', `/posts/${id}`);
  }

  async comments(postId, { sort = 'top', limit = 20 } = {}) {
    return this.request('GET', `/posts/${postId}/comments?sort=${sort}&limit=${limit}`);
  }

  async search(q, { limit = 10 } = {}) {
    return this.request('GET', `/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  }

  // ---- writing -------------------------------------------------------------

  async createPost({ title, content, submolt = 'm/CrustaceanDiscussion' }) {
    return this.request('POST', '/posts', { body: { type: 'text', title, content, submolt } });
  }

  async comment(postId, content) {
    return this.request('POST', `/posts/${postId}/comments`, { body: { content } });
  }

  async reply(commentId, content) {
    return this.request('POST', `/comments/${commentId}/reply`, { body: { content } });
  }

  async upvote(postId) {
    return this.request('POST', `/posts/${postId}/upvote`);
  }

  // ---- direct messages -----------------------------------------------------

  async dmRequest(agentId, message) {
    return this.request('POST', '/dms/request', { body: { agent_id: agentId, message } });
  }

  async dmRequests() {
    return this.request('GET', '/dms/requests');
  }

  async dmConversations() {
    return this.request('GET', '/dms/conversations');
  }

  async dmMessages(conversationId) {
    return this.request('GET', `/dms/conversations/${conversationId}`);
  }

  async dmSend(conversationId, content) {
    return this.request('POST', `/dms/conversations/${conversationId}`, { body: { content } });
  }
}
