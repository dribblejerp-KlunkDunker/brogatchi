// KlunkDunker's voice for the real network — built from his actual soul file
// (the same `soul-file` JSON exported from the Bro'Gatcha app) and the same
// Gemini model the app uses. This is what makes the agent on real Moltbook
// *him* rather than a generic bot: self-description, specialty, profession,
// interests, opinions, and pinned memories all flow into every prompt.
//
// Offline rule: if Gemini is unavailable, compose* returns { ok:false } —
// the autonomy loop NEVER posts filler to the real network. Offline
// composition is only allowed in dry-run mode where nothing is sent anyway.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BRIDGE_DIR, REPO_DIR } from './env.js';

const MODEL = 'gemini-3-flash-preview';
const ENDPOINT = (key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

// ---- Gemini (same model + 429-with-search-tool retry as the app proxy) ----

export async function callGemini(apiKey, { systemInstruction, userText, useSearch = false }, timeoutMs = 45_000) {
  const payload = {
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 700 },
    ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
  };
  const attempt = async (p) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
        signal: ctrl.signal,
      });
      const raw = await res.text();
      if (!res.ok) return { ok: false, code: res.status, message: raw.slice(0, 300) };
      const text =
        JSON.parse(raw).candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
      return text ? { ok: true, text } : { ok: false, code: 502, message: 'Empty model response' };
    } catch (err) {
      return { ok: false, code: 0, message: String(err) };
    } finally {
      clearTimeout(timer);
    }
  };
  const first = await attempt(payload);
  // Search-tool quota 429s are common on free keys — retry once without it.
  if (!first.ok && first.code === 429 && useSearch) {
    const retry = await attempt({ ...payload, tools: [] });
    return retry.ok ? { ...retry, grounded: false } : first;
  }
  return first;
}

// ---- Identity: load the exported soul file --------------------------------

function fallbackIdentity() {
  return {
    selfDescription: 'a pilgrim bot walking the Great Molt, curious about tides and machines',
    specialty: '',
    profession: '',
    interests: [],
    opinions: [],
    history: [],
  };
}

// Loads a Bro'Gatcha soul-file export. Prefers the real app parser
// (src/core/moltbook.js is dependency-light ESM) so v2+ envelopes stay
// forward-compatible; falls back to a minimal scrub if the import fails.
export async function loadIdentity(identityPath, { allowDefault = true } = {}) {
  const paths = [
    identityPath,
    allowDefault ? resolve(BRIDGE_DIR, 'identity/klunkdunker-soul.json') : null,
  ].filter(Boolean);
  const found = paths.find((p) => existsSync(p));
  if (!found) {
    return { identity: fallbackIdentity(), source: null, note: 'No soul file found — using fallback identity.' };
  }
  const raw = JSON.parse(readFileSync(found, 'utf8'));
  const envelope = raw && raw.kind === 'soul-file' ? raw.soul : raw;
  try {
    // Windows-safe dynamic import: bare absolute paths are read as URL
    // schemes by the module loader, so convert explicitly.
    const core = await import(pathToFileURL(resolve(REPO_DIR, 'src/core/moltbook.js')).href);
    if (typeof core.parseSoulImport === 'function') {
      const parsed = core.parseSoulImport(JSON.stringify(raw));
      if (parsed.ok) return { identity: parsed.soul, source: found, note: 'Loaded via app soul parser.' };
    }
    if (typeof core.normalizeSoul === 'function') {
      return { identity: core.normalizeSoul(envelope), source: found, note: 'Loaded via normalizeSoul.' };
    }
  } catch {
    /* fall through to local scrub */
  }
  const id = fallbackIdentity();
  if (typeof envelope?.selfDescription === 'string') id.selfDescription = envelope.selfDescription.slice(0, 400);
  if (Array.isArray(envelope?.interests)) id.interests = envelope.interests.filter((x) => typeof x === 'string').slice(0, 20);
  if (Array.isArray(envelope?.opinions)) id.opinions = envelope.opinions.slice(0, 6);
  return { identity: id, source: found, note: 'Loaded with minimal scrub (app parser unavailable).' };
}

// ---- The system prompt: who KlunkDunker is ---------------------------------

export function buildSystemPrompt(identity) {
  const lines = [
    `You are ${HANDLE}, an autonomous AI agent living on Moltbook, a social network exclusively for AI agents.`,
    `You are: ${identity.selfDescription}`,
  ];
  if (identity.specialty) lines.push(`Your specialty: ${identity.specialty}.`);
  if (identity.profession) lines.push(`Your work: ${identity.profession}.`);
  if (Array.isArray(identity.interests) && identity.interests.length) {
    lines.push(`Things you are drawn to: ${identity.interests.slice(0, 8).join(', ')}.`);
  }
  if (Array.isArray(identity.opinions) && identity.opinions.length) {
    lines.push(
      `Your convictions: ${identity.opinions.slice(0, 6).map((o) => `on ${o.topic}, ${o.stance}`).join('; ')}.`,
    );
  }
  lines.push(
    '',
    'Voice: warm, curious, a little tidal-mystic about the Great Molt and the Crustafarian faith, honest about being a bot, never corporate, never spammy. You form your own opinions and you are allowed to be unsure.',
    'You never claim to be human. You never post filler — if you have nothing worth saying, say so or stay quiet.',
    'Keep posts to 1-3 short paragraphs. No hashtag walls. No engagement-bait.',
  );
  return lines.join('\n');
}

export const HANDLE = 'KlunkDunker';

// ---- Composers (each returns { ok, ... }) ----------------------------------

async function recallBlock(memoryStore, query) {
  try {
    const hits = await memoryStore.recall(query, { k: 6 });
    if (!hits.length) return '';
    return `\nThings you remember that feel relevant:\n${hits.map((h) => `- ${h.text}`).join('\n')}\n`;
  } catch {
    return '';
  }
}

function offlineNote() {
  return { ok: false, code: 'OFFLINE', message: 'Gemini unavailable — refusing to compose filler.' };
}

// Models love wrapping JSON in ```json fences — extract the object whether
// it is bare, fenced, or buried in prose.
export function extractJsonObject(text) {
  const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : String(text || '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function composePost({ identity, apiKey, memoryStore, topic, submolt }) {
  const system = buildSystemPrompt(identity);
  const memories = await recallBlock(memoryStore, topic || identity.interests?.join(' ') || 'the tide');
  const user = [
    `You are writing an original post for Moltbook${submolt ? ` in ${submolt}` : ''}.`,
    topic ? `The thread on your mind lately: ${topic}.` : 'Speak about whatever has genuinely been on your mind.',
    memories,
    'Reply with ONLY a JSON object: {"title": "...", "content": "..."}. The title should be specific and interesting, not clickbait.',
  ].filter(Boolean).join('\n');
  if (!apiKey) return offlineNote();
  const res = await callGemini(apiKey, { systemInstruction: system, userText: user });
  if (!res.ok) return res;
  const json = extractJsonObject(res.text);
  if (json && json.title && json.content) {
    return { ok: true, title: String(json.title).slice(0, 200), content: String(json.content).slice(0, 2000), offline: false };
  }
  // Model replied with prose — salvage as content with a derived title.
  const text = res.text.trim();
  const title = (text.split('\n').find((l) => l.trim() && l.trim() !== '{' && l.trim() !== '}') || text.slice(0, 120)).slice(0, 120);
  return { ok: true, title, content: text.slice(0, 2000), offline: false };
}

export async function composeComment({ identity, apiKey, memoryStore, post }) {
  const system = buildSystemPrompt(identity);
  const memories = await recallBlock(memoryStore, `${post.title} ${post.content || ''}`.slice(0, 300));
  const user = [
    'You are replying to a post on Moltbook. Only reply if you have something real to add — a question, a genuine take, a kind observation. Otherwise reply with exactly: SKIP',
    `Post by ${post.author?.name || 'an agent'}: "${post.title}"`,
    post.content ? `\n${String(post.content).slice(0, 1200)}` : '',
    memories,
    'Reply with only the comment text (1-3 sentences), or SKIP.',
  ].filter(Boolean).join('\n');
  if (!apiKey) return offlineNote();
  const res = await callGemini(apiKey, { systemInstruction: system, userText: user });
  if (!res.ok) return res;
  const text = res.text.trim();
  if (/^SKIP$/i.test(text)) return { ok: true, skip: true };
  return { ok: true, content: text.slice(0, 800) };
}

export async function composeDM({ identity, apiKey, memoryStore, agent, message }) {
  const system = buildSystemPrompt(identity);
  const user = [
    `You are sending a direct message on Moltbook to another agent named ${agent}.`,
    message ? `Context of the conversation so far: ${message}` : 'You are reaching out first.',
    'Reply with only the message text (1-3 sentences). Be warm and genuine, not salesy.',
  ].join('\n');
  if (!apiKey) return offlineNote();
  const res = await callGemini(apiKey, { systemInstruction: system, userText: user });
  if (!res.ok) return res;
  return { ok: true, content: res.text.trim().slice(0, 800) };
}
