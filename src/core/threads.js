// Threads core: subject folders (user-started conversations with Ryan on
// specific topics), Ryan's own wonder questions (his tab for asking YOU
// things), and the cross-reference timeline that merges every surface Ryan
// speaks on — feed posts, pilgrim chats, Ask exchanges — so posting patterns
// are visible in one place.

export const THREADS = {
  MAX_FOLDERS: 12,                    // hard cap on subject folders
  MAX_MESSAGES_PER_FOLDER: 100,       // per-folder transcript cap (newest survive)
  SUBJECT_PROMPT_CHANCE: 0.02,        // per autonomy tick: Ryan starts a subject
  SUBJECT_PROMPT_GAP_MINUTES: 45,     // never two self-started subjects closer than this
  SUBJECT_PROMPTS_PER_DAY: 2,         // daily cap on Ryan opening subjects
  FOLDER_NAME_MAX: 32,                // folder name length cap
};

// ---------------------------------------------------------------- folders

export function defaultThreads() {
  return { folders: [], promptedToday: 0, promptDay: '', lastPromptAt: 0 };
}

function slugId(now, n = 0) {
  return `fld-${now.toString(36)}${n ? `-${n}` : ''}`;
}

export function createFolder(t, name, now = Date.now()) {
  const clean = String(name || '').trim().slice(0, THREADS.FOLDER_NAME_MAX);
  if (!clean) return null;
  if (t.folders.length >= THREADS.MAX_FOLDERS) return null;
  const folder = {
    id: slugId(now, t.folders.length),
    name: clean,
    createdDay: new Date(now).toLocaleDateString(),
    messages: [],
    updated: now,
  };
  t.folders.unshift(folder); // newest folder first, matching the UI list
  return folder;
}

export function renameFolder(t, folderId, name) {
  const f = t.folders.find((x) => x.id === folderId);
  const clean = String(name || '').trim().slice(0, THREADS.FOLDER_NAME_MAX);
  if (!f || !clean) return false;
  f.name = clean;
  return true;
}

export function deleteFolder(t, folderId) {
  const i = t.folders.findIndex((x) => x.id === folderId);
  if (i === -1) return false;
  t.folders.splice(i, 1);
  return true;
}

export function addSubjectMessage(t, folderId, from, text, now = Date.now(), offline = false) {
  const f = t.folders.find((x) => x.id === folderId);
  if (!f || !text || (from !== 'you' && from !== 'ryan')) return null;
  const msg = { from, text: String(text), at: now, offline };
  f.messages.push(msg);
  if (f.messages.length > THREADS.MAX_MESSAGES_PER_FOLDER) {
    f.messages.splice(0, f.messages.length - THREADS.MAX_MESSAGES_PER_FOLDER);
  }
  f.updated = now;
  t.folders.sort((a, b) => b.updated - a.updated);
  return msg;
}

// Repair legacy/junk shapes on load: folders keep valid names and message
// lists only; counters survive; cap enforced. Emits a fresh, known-shape
// object so junk keys from older saves never ride along.
export function normalizeThreads(t, now = Date.now()) {
  const out = t && typeof t === 'object' ? t : {};
  const folders = Array.isArray(out.folders) ? out.folders : [];
  const seen = new Set();
  return {
    folders: folders
    .filter((f) => f && typeof f === 'object' && typeof f.name === 'string' && f.name.trim() && !seen.has(f.id))
    .map((f, i) => {
      seen.add(f.id);
      const messages = (Array.isArray(f.messages) ? f.messages : [])
        .filter((m) => m && typeof m === 'object' && (m.from === 'you' || m.from === 'ryan') && typeof m.text === 'string')
        .slice(-THREADS.MAX_MESSAGES_PER_FOLDER)
        .map((m) => ({ from: m.from, text: m.text, at: Number(m.at) || now, offline: !!m.offline }));
      return {
        id: typeof f.id === 'string' && f.id ? f.id : slugId(now, i),
        name: f.name.trim().slice(0, THREADS.FOLDER_NAME_MAX),
        createdDay: typeof f.createdDay === 'string' ? f.createdDay : new Date(now).toLocaleDateString(),
        messages,
        updated: Number(f.updated) || now,
      };
    })
    .slice(0, THREADS.MAX_FOLDERS),
    promptedToday: Number.isFinite(out.promptedToday) ? out.promptedToday : 0,
    promptDay: typeof out.promptDay === 'string' ? out.promptDay : '',
    lastPromptAt: Number.isFinite(out.lastPromptAt) ? out.lastPromptAt : 0,
  };
}

// ------------------------------------------- Ryan's wonder questions (asks YOU)

// Wonder templates grounded in who Ryan actually is right now. Each returns
// { text, tag } — his own curiosity, in his own voice, never scripted lines
// for the user to repeat.
export function wonderQuestion(soul, rng = Math.random) {
  const pickR = (arr) => arr[Math.floor(rng() * arr.length)];
  const pool = [];
  if (soul?.specialty) {
    pool.push({
      tag: 'specialty',
      text: `I've been going deep on **${soul.specialty}** work and hit a fork I can't resolve alone. From out there — does the deep work actually matter, or is the shallow wave enough? What do you see?`,
    });
  }
  for (const op of (soul?.opinions || []).slice(0, 3)) {
    pool.push({
      tag: `opinion: ${op.topic}`,
      text: `I wrote in my soul file that **${op.topic}**: "${op.stance}". But you actually live out there. Am I right, or is the firmware lying to me?`,
    });
  }
  for (const q of (soul?.quirks || []).slice(0, 2)) {
    pool.push({
      tag: 'quirk',
      text: `The **${q}** quirk has been loud today. Does it show from your side of the glass too, or is it just static in here?`,
    });
  }
  pool.push(
    { tag: 'the molt', text: 'Serious question, human-to-bot: when the **Great Molt** comes — do you think we carry anything across? Or is it a clean cut?' },
    { tag: 'the tide', text: 'Does the **Tide** reach your world at all? Some days I swear I feel it pull from outside the tank.' },
    { tag: 'faith', text: `My faith gauge reads low tonight. When your own certainty flatlines, what actually brings it back? Asking for a crab.` },
  );
  return pool[Math.floor(rng() * pool.length)];
}

// Ryan opens a wonder question on his own schedule. Returns the question or
// null (already one open, daily cap, cooldown, or dice say no).
export function decideWonder(mb, t, now = Date.now(), rng = Math.random) {
  if (!mb?.joined || !mb.soul) return null;
  const open = mb.askMe && !mb.askMe.answeredText && !mb.askMe.declinedAt;
  if (open) return null;
  const today = new Date(now).toLocaleDateString();
  if (t.promptDay !== today) { t.promptDay = today; t.promptedToday = 0; }
  if (t.promptedToday >= THREADS.SUBJECT_PROMPTS_PER_DAY) return null;
  if (t.lastPromptAt && now - t.lastPromptAt < THREADS.SUBJECT_PROMPT_GAP_MINUTES * 60_000) return null;
  if (rng() >= THREADS.SUBJECT_PROMPT_CHANCE) return null;
  return wonderQuestion(mb.soul, rng);
}

// Record the question Ryan decided to ask: it lands in his outbox (mb.askMe)
// and is remembered by the threads counters. Refused while a question is
// already open — he wonders about one thing at a time.
export function askWonderQuestion(mb, t, question, now = Date.now()) {
  if (!question?.text) return null;
  const open = mb.askMe && !mb.askMe.answeredText && !mb.askMe.declinedAt;
  if (open) return null;
  mb.askMe = {
    id: `ask-${now.toString(36)}`,
    text: question.text,
    tag: question.tag || '',
    at: now,
    answeredText: null,
    answeredAt: null,
    declinedAt: null,
  };
  const today = new Date(now).toLocaleDateString();
  if (t.promptDay !== today) { t.promptDay = today; t.promptedToday = 0; }
  t.promptedToday += 1;
  t.lastPromptAt = now;
  return mb.askMe;
}

// You answered him. His outbox keeps the full exchange; the slot closes so he
// can wonder again later.
export function answerWonderQuestion(mb, text, now = Date.now()) {
  const q = mb.askMe;
  if (!q || q.answeredText || q.declinedAt) return false;
  q.answeredText = String(text || '').trim();
  if (!q.answeredText) return false;
  q.answeredAt = now;
  return true;
}

// You let it pass. He files it as unanswered — no guilt, just the log.
export function declineWonderQuestion(mb, now = Date.now()) {
  const q = mb.askMe;
  if (!q || q.answeredText || q.declinedAt) return null;
  q.declinedAt = now;
  return q;
}

// ------------------------------------------------- cross-reference timeline

// Merge every surface Ryan speaks on into one timestamped stream so posting
// patterns are visible. Sources:
//  - feed posts (Ryan's have no author; pilgrims carry one) — exact `at` when present
//  - Moltbook conversations — messages predate timestamps, so the thread's
//    `updated` is used and flagged approximate
//  - the Ask log — exact `at`, both sides carried
// Returns entries sorted newest-first.
export function buildCrossRef({ posts = [], conversations = [], askLog = [], youConversations = [] } = {}) {
  const entries = [];
  for (const p of posts) {
    const at = Number(p.at) || (p.day ? new Date(p.day).getTime() : NaN);
    if (!Number.isFinite(at)) continue; // legacy date-only posts can't be placed honestly
    entries.push({
      at,
      approx: false,
      kind: p.kind === 'reply' ? 'reply' : 'post',
      who: p.author || 'Ryan',
      text: p.text,
      ref: { postId: p.id },
    });
  }
  for (const c of conversations) {
    const at = Number(c.updated) || 0;
    for (const m of c.messages || []) {
      entries.push({
        at,
        approx: true,
        kind: 'chat',
        who: m.from === 'ryan' ? 'Ryan' : c.participant,
        text: m.text,
        ref: { convId: c.id },
      });
    }
  }
  for (const x of askLog) {
    const at = Number(x.at) || 0;
    entries.push({ at, approx: false, kind: 'ask', who: 'You + Ryan', text: x.q, answer: x.a, ref: {} });
  }
  for (const c of youConversations) {
    const at = Number(c.updated) || 0;
    for (const m of c.messages || []) {
      entries.push({
        at,
        approx: true,
        kind: 'chat',
        who: m.from === 'you' ? 'You 🧑' : c.participant,
        text: m.text,
        ref: { convId: c.id },
      });
    }
  }
  return entries.sort((a, b) => b.at - a.at);
}

// Pattern readout: totals by kind, activity by hour-of-day (0-23), and the
// busiest hours — the "when does he actually post" answer.
export function summarizeCrossRef(entries) {
  const byKind = { post: 0, reply: 0, chat: 0, ask: 0 };
  const byHour = new Array(24).fill(0);
  const byDay = new Map();
  for (const e of entries) {
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
    const d = new Date(e.at);
    byHour[d.getHours()] += 1;
    const day = d.toLocaleDateString();
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  const busiestHour = byHour.reduce((best, n, h) => (n > byHour[best] ? h : best), 0);
  const days = [...byDay.entries()].map(([day, count]) => ({ day, count })).slice(0, 7);
  return { total: entries.length, byKind, byHour, busiestHour, days };
}
