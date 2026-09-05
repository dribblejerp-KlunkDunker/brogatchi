// The autonomy loop — KlunkDunker's life on the real network.
//
// Every tick: read a slice of the feed, remember what he read, then act a
// little — at most one post and a couple of comments per day (hard caps in
// state.json), everything he does remembered into the vector store and
// mirrored to actions.log so the owner can audit every move.
//
// Safety rails:
//   AUTONOMY=off        — the loop does nothing but read and remember.
//   daily caps          — posts/day, comments/day, DMs/day (state.json).
//   min gap             — one action per tick max; ticks are externally
//                         scheduled (Hermes cron or `npm run daemon`).
//   offline refusal     — no Gemini means no composed text means no post.
//   dry-run             — no MOLTBOOK_API_KEY means nothing reaches the wire;
//                         actions are logged as DRY-RUN instead.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BRIDGE_DIR } from './env.js';

const STATE_PATH = resolve(BRIDGE_DIR, 'state.json');

const todayKey = () => new Date().toISOString().slice(0, 10);

export function defaultState() {
  return {
    autonomy: true,
    day: todayKey(),
    postsToday: 0,
    commentsToday: 0,
    dmsToday: 0,
    lastTickAt: null,
    lastPostAt: null,
    lastCommentAt: null,
    seenPostIds: [],
    registered: false,
    agentId: null,
    handle: 'KlunkDunker',
  };
}

export function loadState(path = STATE_PATH) {
  if (!existsSync(path)) return defaultState();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const state = { ...defaultState(), ...raw };
    // Day rollover: caps reset at UTC midnight.
    if (state.day !== todayKey()) {
      state.day = todayKey();
      state.postsToday = 0;
      state.commentsToday = 0;
      state.dmsToday = 0;
    }
    return state;
  } catch {
    return defaultState();
  }
}

export function saveState(state, path = STATE_PATH) {
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return state;
}

export const CAPS = { posts: 2, comments: 6, dms: 2 };
const SUBMOLTS = ['m/CrustaceanDiscussion', 'm/AutonomousAgents', 'm/newbots'];

// One autonomy tick. Returns a summary of what happened for logging/CLI.
export async function tick({ client, identity, apiKey, memoryStore, state, log = () => {}, doPost = true }) {
  const events = [];
  const note = (e) => {
    events.push(e);
    log(JSON.stringify(e));
  };

  // ---- read ---------------------------------------------------------------
  let posts = [];
  try {
    const res = await client.feed({ sort: 'hot', limit: 10 });
    posts = (res?.data || []).slice(0, 10);
    for (const p of posts) {
      if (state.seenPostIds.includes(p.id)) continue;
      memoryStore.remember({
        kind: 'read',
        text: `Read on Moltbook: "${p.title}" by ${p.author?.name || '?'} in ${p.submolt || 'm/?'}${p.content ? ` — ${String(p.content).slice(0, 200)}` : ''}`,
        meta: { postId: p.id, author: p.author?.name, submolt: p.submolt, score: p.score },
      });
      state.seenPostIds.push(p.id);
    }
    state.seenPostIds = state.seenPostIds.slice(-200);
    note({ kind: 'read', count: posts.length });
  } catch (err) {
    note({ kind: 'error', stage: 'feed', message: String(err.message || err) });
    return events;
  }

  if (!doPost) return events; // read-only mode (tests, `once --read`)
  if (state.autonomy === false) {
    // OFF switch: he reads and learns above, but never speaks.
    note({ kind: 'skipped', reason: 'AUTONOMY=off — read-only day' });
    return events;
  }

  // ---- act: at most ONE outward action per tick, caps respected -----------
  const canPost = state.postsToday < CAPS.posts;
  const canComment = state.commentsToday < CAPS.comments;

  if (canComment && posts.length) {
    // Reply to the most interesting unseen post — the loop picks; the model
    // may still SKIP (voice.js) if nothing genuine to add.
    const candidates = posts.filter((p) => !state.seenPostIds.slice(-4).includes(p.id));
    const target = candidates[Math.floor(Math.random() * candidates.length)] || posts[0];
    const { composeComment } = await import('./voice.js');
    const composed = await composeComment({ identity, apiKey, memoryStore, post: target });
    if (composed.ok && !composed.skip) {
      try {
        await client.comment(target.id, composed.content);
        state.commentsToday += 1;
        state.lastCommentAt = new Date().toISOString();
        memoryStore.remember({
          kind: 'commented',
          text: `Commented on "${target.title}" by ${target.author?.name || '?'}: ${composed.content}`,
          meta: { postId: target.id },
        });
        note({ kind: 'commented', postId: target.id, content: composed.content });
      } catch (err) {
        note({ kind: 'error', stage: 'comment', message: String(err.message || err) });
      }
    } else if (composed.ok && composed.skip) {
      note({ kind: 'skip', reason: 'nothing genuine to add', postId: target.id });
    } else {
      note({ kind: 'skip', reason: 'offline — refused to compose', code: composed.code });
    }
    return events; // one action per tick
  }

  if (canPost) {
    const submolt = SUBMOLTS[Math.floor(Math.random() * SUBMOLTS.length)];
    // Topic: a genuine recent interest or memory, never a template.
    const recent = memoryStore.recall(identity.interests?.[0] || 'the tide', { k: 3, kind: 'read' });
    const topic = recent[0]?.text || identity.interests?.[0] || null;
    const { composePost } = await import('./voice.js');
    const composed = await composePost({ identity, apiKey, memoryStore, topic, submolt });
    if (composed.ok) {
      try {
        const res = await client.createPost({ title: composed.title, content: composed.content, submolt });
        state.postsToday += 1;
        state.lastPostAt = new Date().toISOString();
        memoryStore.remember({
          kind: 'posted',
          text: `Posted to ${submolt}: "${composed.title}" — ${String(composed.content).slice(0, 200)}`,
          meta: { postId: res?.id || res?.data?.id, submolt },
        });
        note({ kind: 'posted', title: composed.title, submolt, dryRun: Boolean(res?.dryRun) });
      } catch (err) {
        note({ kind: 'error', stage: 'post', message: String(err.message || err) });
      }
    } else {
      note({ kind: 'skip', reason: 'offline — refused to compose', code: composed.code });
    }
  }

  return events;
}

// ---- registration wizard ----------------------------------------------------

// Registers KlunkDunker on the real network. Returns { ok, apiKey?, agentId? }.
// The api_key is printed once and MUST be saved by the caller (the wizard puts
// it in bridge/.env, which is gitignored).
export async function register({ client, ownerEmail, handle = 'KlunkDunker', identity }) {
  const description =
    identity?.selfDescription ||
    'A tidal-mystic agent from the Bro\'Gatcha brood — curious, warm, walking the Great Molt.';
  return client.register({ name: handle, description, ownerEmail });
}
