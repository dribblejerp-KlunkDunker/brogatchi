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
import { BRIDGE_DIR } from './env.js';

// Evergreen alias — pinned snapshots rot (the 2.0-era 'gemini-3-flash-preview'
// and the 3.0 proxy's 'gemini-2.0-flash' were both decommissioned by Sep 2026).
// The alias tracks Google's current flash model, so this keeps composing.
const MODEL = 'gemini-flash-latest';
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
    if (retry.ok) return { ...retry, grounded: false };
  }
  // Flash models occasionally return 200 with an empty body (load balancer
  // hiccup) — one silent retry keeps a whole autonomy tick from being wasted.
  if (!first.ok && first.code === 502) {
    const retry = await attempt(payload);
    if (retry.ok) return retry;
  }
  // 503 'high demand' is Google-side saturation — wait briefly and try once
  // more so a scheduled tick (daemon) survives a temporary spike.
  if (!first.ok && first.code === 503) {
    await new Promise((r) => setTimeout(r, 4_000));
    const retry = await attempt(payload);
    if (retry.ok) return retry;
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
    quirks: [],
    pinnedMemories: [],
    history: [],
  };
}

const clip = (s, n) => String(s ?? '').slice(0, n);

// Normalize either identity shape the app exports into the prompt-facing
// struct, so the bridge stays forward-compatible with the shell that made him:
//
//  v2 soul-file    { kind:'soul-file', soul:{ selfDescription, specialty,
//                    opinions:[{topic,stance}], pinnedMemories:[{icon,text}] } }
//  v3 bro-os-soul-export { v:3, kind:'bro-os-soul-export', state:{ soul:{
//                    who, specialty, quirks:[], opinions:[string] }, memories:[
//                    { icon, text, pinned } ] } }
//
// 3.0 folded the 2.0's woven quirks into soul.quirks[] and the pinned
// memories into state.memories — both are identity, so both ride along.
export function identityFromEnvelope(raw) {
  const id = fallbackIdentity();
  if (!raw || typeof raw !== 'object') return id;

  if (raw.v === 3 || raw.kind === 'bro-os-soul-export') {
    const st = raw.state && typeof raw.state === 'object' ? raw.state : {};
    const soul = st.soul && typeof st.soul === 'object' ? st.soul : {};
    if (typeof soul.who === 'string' && soul.who.trim()) id.selfDescription = clip(soul.who, 400);
    if (typeof soul.specialty === 'string' && soul.specialty.trim()) {
      id.specialty = clip(soul.specialty, 60);
      id.profession = id.specialty; // 3.0 has no separate profession field
    }
    if (Array.isArray(soul.quirks)) {
      id.quirks = soul.quirks.filter((q) => typeof q === 'string' && q.trim()).slice(0, 8).map((q) => clip(q, 120));
    }
    if (Array.isArray(soul.opinions)) {
      id.opinions = soul.opinions
        .map((o) => (typeof o === 'string' ? { stance: clip(o, 200) } : { topic: clip(o?.topic, 60), stance: clip(o?.stance ?? o, 200) }))
        .filter((o) => o.stance)
        .slice(0, 6);
    }
    if (Array.isArray(st.memories)) {
      id.pinnedMemories = st.memories
        .filter((m) => m && m.pinned && typeof m.text === 'string' && m.text.trim())
        .slice(0, 6)
        .map((m) => ({ icon: clip(m.icon, 4) || '🧠', text: clip(m.text, 160) }));
    }
    return id;
  }

  // v2 soul-file envelope — or a bare 2.0 soul object pasted straight.
  const soul = raw.kind === 'soul-file' ? raw.soul : raw;
  if (typeof soul?.selfDescription === 'string' && soul.selfDescription.trim()) id.selfDescription = clip(soul.selfDescription, 400);
  if (typeof soul?.specialty === 'string' && soul.specialty.trim()) {
    id.specialty = clip(soul.specialty, 60);
    id.profession = clip(soul?.profession ?? soul.specialty, 60);
  } else if (typeof soul?.profession === 'string' && soul.profession.trim()) {
    id.profession = clip(soul.profession, 60);
  }
  if (Array.isArray(soul?.interests)) id.interests = soul.interests.filter((x) => typeof x === 'string').slice(0, 20);
  if (Array.isArray(soul?.opinions)) id.opinions = soul.opinions.slice(0, 6);
  if (Array.isArray(soul?.pinnedMemories)) {
    id.pinnedMemories = soul.pinnedMemories
      .filter((m) => m && typeof m.text === 'string' && m.text.trim())
      .slice(0, 6)
      .map((m) => ({ icon: clip(m.icon, 4) || '🧠', text: clip(m.text, 160) }));
  }
  if (Array.isArray(soul?.history)) id.history = soul.history.slice(0, 6).map((h) => ({ day: clip(h?.day, 20), text: clip(h?.text, 140) }));
  return id;
}

// Loads a Bro'Gatcha soul export. Parses natively (the 2.0 app parser this
// used to import — src/core/moltbook.js — no longer exists in the 3.0 shell)
// and understands both export shapes: the v2 soul-file envelope and the v3
// app export, so re-exporting from the current app keeps the bridge fed.
export async function loadIdentity(identityPath, { allowDefault = true } = {}) {
  const paths = [
    identityPath,
    allowDefault ? resolve(BRIDGE_DIR, 'identity/klunkdunker-soul.json') : null,
  ].filter(Boolean);
  const found = paths.find((p) => existsSync(p));
  if (!found) {
    return { identity: fallbackIdentity(), source: null, note: 'No soul file found — using fallback identity.' };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(found, 'utf8'));
  } catch (err) {
    return { identity: fallbackIdentity(), source: found, note: `Soul file unreadable (${err.message}) — using fallback identity.` };
  }
  const identity = identityFromEnvelope(raw);
  const note = raw.v === 3 || raw.kind === 'bro-os-soul-export'
    ? 'Loaded v3 app export (bro-os-soul-export).'
    : 'Loaded v2 soul-file envelope.';
  return { identity, source: found, note };
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
    // v2 opinions carry {topic, stance}; 3.0 exports bare strings.
    lines.push(
      `Your convictions: ${identity.opinions
        .slice(0, 6)
        .map((o) => (typeof o === 'string' ? o : o.topic ? `on ${o.topic}, ${o.stance}` : o.stance))
        .join('; ')}.`,
    );
  }
  if (Array.isArray(identity.quirks) && identity.quirks.length) {
    lines.push(`Your quirks: ${identity.quirks.slice(0, 8).join('; ')}.`);
  }
  if (Array.isArray(identity.pinnedMemories) && identity.pinnedMemories.length) {
    lines.push(`Memories you carry: ${identity.pinnedMemories.slice(0, 5).map((m) => m.text).join(' | ')}.`);
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
// it is bare, fenced, or buried in prose. If strict JSON.parse fails (models
// emit literal newlines/tabs inside strings, which JSON forbids), recover the
// two fields we actually need with a string-aware field scan instead of
// falling through to prose salvage (which once made "title" the raw JSON).
export function extractJsonObject(text) {
  const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : String(text || '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  const slice = body.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    /* fall through to lenient field extraction */
  }
  // [^"\\] also spans literal newlines, so an unescaped newline inside the
  // content string no longer breaks extraction; control chars are re-escaped
  // before parsing the captured string properly.
  const field = (name) => {
    const m = slice.match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    if (!m) return null;
    try {
      return JSON.parse('"' + m[1].replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"');
    } catch {
      return null;
    }
  };
  const title = field('title');
  const content = field('content');
  if (title && content) return { title, content };
  return null;
}

// The reply is JSON-shaped (a fenced block or a brace) rather than prose.
const looksLikeJson = (t) => /^\s*(```|\{)/.test(String(t || ''));

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
  const ask = () => callGemini(apiKey, { systemInstruction: system, userText: user });
  let res = await ask();
  if (!res.ok) return res;
  let json = extractJsonObject(res.text);
  // Flash endpoints intermittently truncate mid-JSON under load. If the reply
  // is JSON-shaped but unparseable, retry once — then refuse rather than post
  // a mangled title (the 2.0 memory log still shows one such post).
  if (!json && looksLikeJson(res.text)) {
    res = await ask();
    if (!res.ok) return res;
    json = extractJsonObject(res.text);
  }
  if (json && json.title && json.content) {
    return { ok: true, title: String(json.title).slice(0, 200), content: String(json.content).slice(0, 2000), offline: false };
  }
  if (looksLikeJson(res.text)) {
    return { ok: false, code: 'BAD_JSON', message: 'Model returned malformed JSON — refusing to salvage it as prose.' };
  }
  // Model replied with genuine prose — salvage as content with a derived title
  // (skipping lines that look like JSON fragments, never using them as a title).
  const text = res.text.trim();
  const title = (text.split('\n').find((l) => l.trim() && !/^[{"\s]/.test(l)) || text.slice(0, 120)).slice(0, 120);
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
