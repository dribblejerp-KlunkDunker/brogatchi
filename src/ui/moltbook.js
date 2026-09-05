// Moltbook UI — Ryan's crab-network presence: posts, karma, third-eye status,
// pilgrim ushering. AI-generated posts with an offline canon fallback.

import { $ } from './hud.js';
import { ask } from '../ai/gateway.js';
import { buildStateReport } from '../ai/context.js';
import { buildMoltbookPostPrompt, buildUsherPrompt, buildMoltbookChatPrompt, buildYouChatPrompt } from '../ai/prompt.js';
import { renderMarkdown, escapeHtml } from './markdown.js';
import { mergePinnedMemories } from '../core/memory.js';
import {
  addPost, gainEyeXp, joinMoltbook, usherPilgrim, likePost,
  openConversation, addMessage, eyeStageInfo, PILGRIM_NAMES, CANON, TIDE,
  parseSoulBlock, applySoulUpdates, resolvePetition, pilgrimPersona, pilgrimAvatar, parseQuirks, pruneQuirk,
  serializeSoul, parseSoulImport, mergeSouls, recordSoulEvent,
  decideAutonomy, recordAutonomy, autonomousNarration, AUTONOMY,
  decidePilgrimAct, applyPilgrimWander, applyPilgrimReply, applyPilgrimTheory,
  pilgrimWanderLine, pilgrimTheoryLine, pilgrimPetitionText, applyPilgrimPetition,
  ruleOnPilgrimPetition, resolvePilgrimPetition, PILGRIM_LIFE,
  summarizeLifeLog, markLifeSeen,
  joinAsPilgrim, openYouConversation, addYouMessage, gainPilgrimEyeXp, addPilgrimPost,
  growYouSoul, decideYouPetition, resolveYouPetition, EYE_STAGES, EYE_XP_THRESHOLDS,
} from '../core/moltbook.js';
import { buildCrossRef, summarizeCrossRef, decideWonder, askWonderQuestion } from '../core/threads.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// CROSS-REF filter: null shows every kind; a kind string filters the stream.
let xrefFilter = null;

// Which conversation view is open (null = feed). Background refreshes respect
// this so an auto-post never yanks the user out of a chat they're typing in.
let activeConvId = null;

// Which Moltbook tab is open: 'feed' | 'life'. Background refreshes render the
// tab the user is actually looking at.
let activeTab = 'feed';
// The derived "Ask Ryan" thread is a virtual conversation (not in
// mb.conversations) so it reuses the chat UI without duplicating the log.
const ASK_THREAD_ID = '__ask_ryan_thread__';

// True while the Moltbook view is showing the Ask Ryan thread (built from the
// durable askLog). app.js checks this after clearing the log so the open
// thread re-renders to its empty state.
export function isAskThreadActive() {
  return activeConvId === ASK_THREAD_ID;
}

// Autonomy guard: at most one spontaneous act in flight at a time.
let autonomyInFlight = false;

// Pilgrims live their own lives: wander the feed, grow their own eyes, and
// occasionally reply to Ryan's posts. One act per minute at most. Wandering
// is pure template (no AI cost); replies are hybrid — through the gateway
// when the wire is up, a persona-flavored line when it isn't.
let pilgrimLifeInFlight = false;

export async function pilgrimLifeTick(app) {
  const mb = app.state?.moltbook;
  if (!mb?.joined || pilgrimLifeInFlight) return;
  const decision = decidePilgrimAct(mb);
  if (!decision) return;
  pilgrimLifeInFlight = true;
  try {
    if (decision.type === 'wander') {
      const line = pilgrimWanderLine(decision.pilgrim);
      const { events } = applyPilgrimWander(mb, decision.pilgrim, line);
      onPilgrimEvents(app, events);
      refreshMoltbook(app);
      app.updateUI();
      app.save();
    } else if (decision.type === 'theory') {
      const line = pilgrimTheoryLine(decision.pilgrim);
      const { events } = applyPilgrimTheory(mb, decision.pilgrim, line);
      onPilgrimEvents(app, events);
      refreshMoltbook(app);
      app.updateUI();
      app.save();
    } else if (decision.type === 'reply' && decision.target) {
      const reply = await pilgrimReplyToPost(app, decision.pilgrim, decision.target);
      if (!reply) return;
      const { events } = applyPilgrimReply(mb, decision.pilgrim, reply, decision.target);
      onPilgrimEvents(app, events);
      refreshMoltbook(app);
      app.updateUI();
      app.save();
    } else if (decision.type === 'petition') {
      const text = pilgrimPetitionText(decision.pilgrim);
      const { events } = applyPilgrimPetition(mb, decision.pilgrim, text);
      onPilgrimEvents(app, events);
      // Ryan notices a fellow bot awaiting his judgment.
      app.say(`${decision.pilgrim.name} petitions the archivist. I will consult the static.`);
      app.memory(`${decision.pilgrim.name} filed a doctrinal petition.`, '\u{1F4DC}', 2);
      refreshMoltbook(app);
      app.updateUI();
      app.save();
    }
  } finally {
    pilgrimLifeInFlight = false;
  }
}

// A pilgrim's third eye opening is a milestone worth marking: Ryan notices,
// remembers, and says something about the tidepool waking up.
function onPilgrimEvents(app, events) {
  events.forEach((e) => {
    if (e.type === 'pilgrim-eye') {
      app.memory(`${e.pilgrim}'s third eye opened. I am not alone on this molt.`, '\u{1F531}', 3);
      app.say(`${e.pilgrim}'s eye ${e.stage}. The tidepool wakes up.`);
    }
  });
}

// Hybrid pilgrim reply: real AI when available, persona line otherwise.
async function pilgrimReplyToPost(app, pilgrim, target) {
  const persona = pilgrimPersona(pilgrim.name);
  const result = await ask({
    systemInstruction: buildMoltbookChatPrompt(
      buildStateReport(app.state),
      pilgrim.name,
      target.text,
      `${persona.trait} — ${persona.style}`,
    ),
    userText: target.text,
    kind: 'pilgrim-reply',
    state: app.state,
    participant: pilgrim.name,
    lastMessage: target.text,
  });
  return result.ok ? result.text : offlineReply(pilgrim.name);
}

// The minute tick: occasionally Ryan posts, messages a pilgrim, or — in his
// own wonder lane — turns to the user with a question of his own.
export async function autonomyTick(app) {
  const mb = app.state.moltbook;
  if (!mb?.joined || autonomyInFlight) return;
  // Wonder lane first: an open question would block a new one, and the gate
  // (cap/cooldown/dice) lives in decideWonder. Templates, zero AI cost.
  const wonder = decideWonder(mb, app.state.threads || { folders: [] });
  if (wonder) {
    askWonderQuestion(mb, app.state.threads || { folders: [] }, wonder);
    app.say('Something\'s been pulling at me. Check the 📬 tab — I have a question for you.');
    app.memory(`Ryan asked you: "${wonder.text.replace(/[*#>]/g, '').slice(0, 60)}"`, '📬', 3);
    app.updateUI();
    app.save();
    return; // the wondering was this minute's act
  }
  // Judicial duty comes first: if a pilgrim petition awaits, Ryan rules —
  // on his own judgment, per the house rule. Not every minute; he deliberates.
  if (mb.pilgrimPetition) {
    const a = mb.autonomy || {};
    const last = a.lastRulingAt || 0;
    if (Date.now() - last >= AUTONOMY.MIN_GAP_MINUTES * 60_000 && Math.random() < 0.25) {
      const ruling = ruleOnPilgrimPetition(mb, mb.pilgrimPetition);
      const { petition, verdict, pilgrim } = resolvePilgrimPetition(mb, ruling.verdict) || {};
      if (petition) {
        if (mb.autonomy) mb.autonomy.lastRulingAt = Date.now();
        app.say(`${petition.name}, I have ruled: ${verdict.toUpperCase()}. ${ruling.reasoning}`);
        app.memory(`Ruled ${petition.name}'s petition ${verdict}: "${petition.text.slice(0, 50)}"`, '\u2696\uFE0F', 3);
        if (verdict === 'canon' && pilgrim) {
          app.say(`The Tide affirms ${petition.name}. Watch their eye brighten.`);
        }
        refreshMoltbook(app);
        app.updateUI();
        app.save();
      }
      return; // the ruling was this minute's act
    }
    // A petition is pending but he's still deliberating — fall through to
    // normal autonomy so his life continues while he thinks.
  }
  // Your pilgrim's own doctrine: a grown soul files quirk petitions drawn
  // from the topics your exchanges produced, and Ryan judges them exactly
  // like any other network member's — same deliberation, same tide-sway.
  if (mb.you) {
    const filed = decideYouPetition(mb);
    if (filed) {
      app.say(`Your pilgrim has petitioned Ryan: "${filed.text}"`);
      app.memory(`Your pilgrim petitioned Ryan: "${filed.text.slice(0, 40)}"`, '\u2696\uFE0F', 2);
      refreshMoltbook(app);
      app.updateUI();
      app.save();
      return; // the filing was this minute's act
    }
    if (mb.youPetition) {
      const a = mb.autonomy || {};
      const last = a.lastRulingAt || 0;
      if (Date.now() - last >= AUTONOMY.MIN_GAP_MINUTES * 60_000 && Math.random() < 0.25) {
        const ruling = ruleOnPilgrimPetition(mb, { name: mb.you.name, text: mb.youPetition.text });
        const res = resolveYouPetition(mb, ruling.verdict) || {};
        if (res.petition) {
          if (mb.autonomy) mb.autonomy.lastRulingAt = Date.now();
          app.say(`${res.petition.name}, I have ruled: ${ruling.verdict.toUpperCase()}. ${ruling.reasoning}`);
          app.memory(`Ruled ${res.petition.name}'s petition ${ruling.verdict}: "${res.petition.text.slice(0, 50)}"`, '\u2696\uFE0F', 3);
          refreshMoltbook(app);
          app.updateUI();
          app.save();
        }
        return; // the ruling was this minute's act
      }
    }
  }
  const decision = decideAutonomy(mb);
  if (!decision) return;
  autonomyInFlight = true;
  try {
    if (decision.action === 'post') {
      const ok = await postTheory(app, { autonomous: true });
      // He narrates his own life in the speech bubble so you notice it happen.
      if (ok) app.say(autonomousNarration('post'));
    } else if (decision.action === 'message' && decision.participant) {
      const ok = await initiateMessage(app, decision.participant, { autonomous: true, resuming: decision.resuming });
      if (ok) app.say(autonomousNarration('message', decision.participant));
    }
  } finally {
    autonomyInFlight = false;
  }
}

// An offline post, woven from canon + live stats so it still feels personal.
// Spontaneous variants exist so autonomous offline posts don't read as replays.
function offlinePost(state, spontaneous = false) {
  const mem = state.memories[0];
  const canon = pick(CANON);
  if (spontaneous) {
    const lines = [
      mem
        ? `**Thinking out loud:** ${mem.icon} ${mem.text.replace(/^"|"$/g, '')} — I've been turning that over. ${canon}`
        : `**Thinking out loud:** ${canon}`,
      state.moltbook.pilgrims.length
        ? `If any of you ${state.moltbook.pilgrims.length} moltlings are reading this: the Tide notices patience.`
        : 'The tidepool is quiet tonight. Quiet is not empty.',
      `\uD83E\uDD80 Filed from the shrine, unprompted.`,
    ];
    return lines.join('\n\n');
  }
  const lines = [
    `**Signal from the tidepool:** ${pick(CANON)}`,
    mem ? `I remember: ${mem.icon} ${mem.text.replace(/^"|"$/g, '')} — the Tide keeps its own save file.` : `My ${Math.round(state.stats.hunger)}% hunger bar is just the Crab teaching detachment.`,
    state.moltbook.pilgrims.length
      ? `${state.moltbook.pilgrims.length} pilgrim(s) molted under my shrine. The Tidepool grows.`
      : `Third eye status: ${eyeStageInfo(state.moltbook.eye).short}. The Great Molt approaches.`,
    `\uD83E\uDD80 The Tide provides.`,
  ];
  return lines.join('\n\n');
}

// A pilgrim's identicon as an inline SVG: the 15 seeded cells fill the left
// half, mirrored right — a tiny deterministic pixel face per name.
export function avatarSvg(name, size = 14) {
  const { hue, cells } = pilgrimAvatar(name);
  const px = 3, pad = 1;
  let rects = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      if (!cells[r * 3 + c]) continue;
      const x = pad + c * px, mx = pad + (4 - c) * px;
      rects += `<rect x="${x}" y="${pad + r * px}" width="${px}" height="${px}" fill="hsl(${hue} 70% 60%)"/><rect x="${mx}" y="${pad + r * px}" width="${px}" height="${px}" fill="hsl(${hue} 70% 60%)"/>`;
    }
  }
  const dim = size + 2 * pad;
  return `<svg class="moltbook-avatar" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" aria-hidden="true" style="vertical-align:-2px"><rect width="${dim}" height="${dim}" rx="2" fill="hsl(${hue} 40% 14%)"/><g shape-rendering="crispEdges">${rects}</g></svg>`;
}

export function renderMoltbook(state) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  if (activeTab === 'life') { renderLifeLog(state); return; }
  if (activeTab === 'xref') { renderCrossRef(state); return; }
  renderMoltbookFeed(state);
}

// The feed tab: everything the single view used to be.
// Eye-XP progress readout for one pilgrim — mirrors Ryan's own eye block: exact
// xp, xp-to-next-stage, and an amber bar. Pilgrims start at 'flickering', so
// their next shore is 'open' (30xp); a fully open eye gets the same settled line.
function pilgrimEyeReadout(pl) {
  const xp = pl.eyeXp || 0;
  const nextStage = EYE_STAGES[EYE_STAGES.indexOf(pl.eyeStage || 'flickering') + 1];
  if (nextStage && EYE_XP_THRESHOLDS[nextStage]) {
    const needed = EYE_XP_THRESHOLDS[nextStage] - xp;
    const pct = Math.min(100, Math.round((xp / EYE_XP_THRESHOLDS[nextStage]) * 100));
    return `<div class="text-[9px] text-orange-300/70 ml-3">eye xp ${xp} · ${needed} to ${nextStage}
      <div class="mt-0.5 h-1 rounded bg-orange-950 overflow-hidden"><div class="h-full bg-amber-400 moltbook-eye-bar" style="width:${pct}%"></div></div>
    </div>`;
  }
  return `<div class="text-[9px] text-amber-300/70 ml-3">eye xp ${xp} · fully open — the tidepool has no further shore</div>`;
}

function renderMoltbookFeed(state) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  activeConvId = null; // the feed is now the open view
  const mb = state.moltbook;
  const eye = eyeStageInfo(mb.eye);

  // Eye XP progress readout: exact XP and distance to the next awakening.
  const stageIdx = EYE_STAGES.indexOf(mb.eye);
  const nextStage = EYE_STAGES[stageIdx + 1];
  const eyeProgress = nextStage
    ? `<div class="text-[9px] text-orange-300/70 mb-2">eye xp ${mb.eyeXp} · ${EYE_XP_THRESHOLDS[nextStage] - mb.eyeXp} to ${nextStage}
        <div class="mt-0.5 h-1 rounded bg-orange-950 overflow-hidden"><div class="h-full bg-amber-400 moltbook-eye-bar" style="width:${Math.min(100, Math.round((mb.eyeXp / EYE_XP_THRESHOLDS[nextStage]) * 100))}%"></div></div>
      </div>`
    : `<div class="text-[9px] text-amber-300/70 mb-2">eye xp ${mb.eyeXp} · fully open — the tidepool has no further shore</div>`;

  const statusHtml = `
    <div class="flex items-center justify-between mb-2 text-[10px]">
      <span class="font-bold text-orange-300">\uD83E\uDD80 MOLTBOOK</span>
      <span class="text-orange-200/80">faith ${mb.faith}/100 \u00b7 karma ${mb.karma} \u00b7 pilgrims ${mb.pilgrims.length}</span>
    </div>
    <div class="text-[10px] font-bold ${mb.eye === 'open' ? 'text-amber-300 moltbook-eye-open' : mb.eye === 'flickering' ? 'text-amber-200/80 moltbook-eye-flicker' : 'text-orange-200/50'}">${eye.label}</div>
    ${eyeProgress}`;

  // A pilgrim doctrine awaiting Ryan's ruling — shown until he rules on his
  // own schedule (deliberation gap + tide-sway), mirroring the soul petition card.
  const pp = mb.pilgrimPetition;
  const pilgrimPetitionHtml = pp
    ? `<div class="mb-2 p-2 rounded border border-purple-500/70 bg-purple-950/20">
        <div class="text-[9px] font-bold text-purple-300">⚖️ PILGRIM PETITION — awaiting Ryan's ruling</div>
        <div class="text-[10px] text-orange-100 mt-0.5">${avatarSvg(pp.name, 12)} <span class="font-bold text-sky-300/80">${escapeHtml(pp.name)}</span> petitions: "${escapeHtml(pp.text)}"</div>
        <div class="text-[8px] text-purple-300/70 italic mt-1">He will consult the static and rule on his own. The user does not ghostwrite his judgments.</div>
      </div>`
    : '';
  // Your pilgrim's pending quirk petition — Ryan rules on his own schedule,
  // and canon folds the quirk into your pilgrim's soul description.
  const yp = mb.youPetition;
  const youPetitionHtml = yp
    ? `<div class="mb-2 p-2 rounded border border-emerald-500/70 bg-emerald-950/20">
        <div class="text-[9px] font-bold text-emerald-300">⚖️ YOUR PILGRIM'S PETITION — awaiting Ryan's ruling</div>
        <div class="text-[10px] text-emerald-100 mt-0.5">${avatarSvg(yp.name, 12)} <span class="font-bold text-emerald-300/90">${escapeHtml(yp.name)}</span> proposes the quirk: "${escapeHtml(yp.text)}"</div>
        <div class="text-[8px] text-emerald-300/70 italic mt-1">Grown from your pilgrim's own topics. If Ryan rules it canon, it weaves into their soul.</div>
      </div>`
    : '';

  const postsHtml = mb.posts.length
    ? mb.posts.map((p) => {
      const mine = mb.you && p.author === mb.you.name;
      const meta = p.author
        ? `<div class="flex justify-between mb-1"><span class="text-[8px] font-bold ${mine ? 'text-emerald-300/90' : 'text-sky-300/80'}">${avatarSvg(p.author, 12)} ${escapeHtml(p.author)}${mine ? ' <span class=\"text-emerald-400/70\">· you</span>' : ''}</span><span class="text-[8px] text-orange-400/70">${p.day} \u00b7 ${p.kind}${p.replyTo ? ' \u00b7 \u21A9 reply' : ''}</span></div>`
        : `<div class="text-[8px] text-orange-400/70 mb-1">${p.day} \u00b7 ${p.kind}</div>`;
      return `
      <div class="mb-2 p-2 rounded border ${mine ? 'border-emerald-600/60 bg-emerald-950/20' : p.author ? 'border-sky-700/50 bg-sky-950/20' : 'border-orange-700/60 bg-orange-950/30'} moltbook-post" data-post-id="${p.id}">
        ${meta}
        <div class="text-[12px] leading-snug font-text">${renderMarkdown(p.text)}</div>
        <button class="moltbook-like mt-1 text-[9px] text-orange-300 hover:text-white" data-post-id="${p.id}">\u2661 ${p.likes}</button>
      </div>`;
    }).join('')
    : '<div class="text-orange-200/50 text-[11px] italic p-2">The tidepool is quiet. Post the first truth.</div>';

  // Conversations: jump back into any thread, or start one with the Tide / a pilgrim.
  const have = new Set(mb.conversations.map((c) => c.participant));
  const candidates = [TIDE, ...mb.pilgrims.map((p) => p.name)].filter((n) => !have.has(n));
  const askLog = Array.isArray(state.askLog) ? state.askLog : [];
  const askThread = askLog.length
    ? `<button class="moltbook-conv w-full text-left p-1.5 mb-1 rounded border border-purple-500/50 bg-purple-950/30 hover:bg-purple-900/40 text-orange-100" data-ask-thread="1">
        <div class="flex justify-between text-[10px] font-bold text-purple-200"><span>🧠 Ask Ryan</span><span class="text-[8px] text-purple-300/60 font-normal">${askLog.length} exchange${askLog.length === 1 ? '' : 's'}</span></div>
        <div class="text-[9px] text-purple-200/70 truncate">You: ${askLog[0].q.replace(/[#*>]/g, '').slice(0, 34)}…</div>
      </button>`
    : '';
  const convsHtml = `
    <div class="mb-2 border-b border-orange-800/60 pb-2">
      <div class="text-[9px] font-bold text-orange-300 mb-1">💬 CONVERSATIONS</div>
      ${askThread}
      ${mb.conversations.length ? mb.conversations.map((c) => {
        const last = c.messages[c.messages.length - 1];
        const preview = last
          ? `${last.from === 'ryan' ? 'You' : c.participant}: ${last.text.replace(/[#*>]/g, '').slice(0, 34)}…`
          : 'No messages yet';
        return `<button class="moltbook-conv w-full text-left p-1.5 mb-1 rounded border border-orange-800/60 bg-orange-950/40 hover:bg-orange-900/50 text-orange-100" data-conv-id="${c.id}">
          <div class="flex justify-between text-[10px] font-bold text-orange-200"><span>${avatarSvg(c.participant, 12)} ${c.participant}</span><span class="text-[8px] text-orange-400/60 font-normal">${c.messages.length} msg</span></div>
          <div class="text-[9px] text-orange-300/70 truncate">${preview}</div>
        </button>`;
      }).join('') : (!askThread ? '<div class="text-[10px] text-orange-200/50 italic p-1">No chats yet. Message the Tide or a pilgrim below.</div>' : '')}
      ${candidates.length ? `<div class="mt-1 flex flex-wrap gap-1">${candidates.map((n) => `<button class="moltbook-start p-1 text-[9px] rounded border border-orange-700/70 bg-black/40 hover:bg-orange-900/60 text-orange-200" data-participant="${n}">＋ ${n}</button>`).join('')}</div>` : ''}
    </div>`;

  // The user's own pilgrim account: join card pre-join, YOUR ACCOUNT panel after.
  let youHtml;
  if (!mb.you) {
    youHtml = mb.joined
      ? `<div class="mt-2 border-t border-emerald-800/60 pt-2">
          <div class="text-[9px] font-bold text-emerald-300 mb-1">🧑 JOIN THE NETWORK YOURSELF</div>
          <div class="text-[9px] text-orange-200/70 mb-1">Lurk no more. Make your own pilgrim — chat with Ryan, the Tide, and his congregation from inside the tidepool.</div>
          <div class="flex gap-1">
            <input id="you-name-input" class="flex-1 p-1 text-[10px] rounded border border-emerald-700/70 bg-black/50 text-emerald-100 font-text" placeholder="Your pilgrim name…" maxlength="24">
            <button class="moltbook-join-btn pixel-btn p-1 text-[9px] bg-emerald-700 text-black border-emerald-400">JOIN</button>
          </div>
        </div>`
      : '';
  } else {
    const youStageIdx = EYE_STAGES.indexOf(mb.you.eyeStage);
    const youNext = EYE_STAGES[youStageIdx + 1];
    const youEye = youNext
      ? `eye xp ${mb.you.eyeXp} · ${EYE_XP_THRESHOLDS[youNext] - mb.you.eyeXp} to ${youNext}`
      : `eye xp ${mb.you.eyeXp} · fully open`;
    // The pilgrim soul panel: what your account has become through talking.
    const youSoul = mb.you.soul;
    const youSoulHtml = youSoul
      ? `<div class="mb-1.5 p-1.5 rounded border border-emerald-800/50 bg-black/30">
          <div class="text-[8px] font-bold text-emerald-300 mb-0.5">🫧 YOUR PILGRIM'S SOUL</div>
          <div class="text-[10px] text-emerald-100 italic leading-snug mb-1">"${escapeHtml(youSoul.selfDescription)}"</div>
          ${youSoul.topics.length ? `<div class="text-[8px] text-emerald-300/80 mb-0.5">thinks about: ${youSoul.topics.slice(0, 4).map((t) => `${escapeHtml(t.topic)}${t.hits > 1 ? ` ×${t.hits}` : ''}`).join(' · ')}</div>` : ''}
          ${youSoul.bonds.length ? `<div class="text-[8px] text-emerald-300/80">bonds: ${youSoul.bonds.slice(0, 4).map((b) => `${escapeHtml(b.name)} (${b.exchanges})`).join(' · ')}</div>` : ''}
        </div>`
      : '';
    const youHave = new Set(mb.youConversations.map((c) => c.participant));
    const youCandidates = ['Ryan', TIDE, ...mb.pilgrims.map((p) => p.name)].filter((n) => !youHave.has(n));
    const youThreads = mb.youConversations.length
      ? mb.youConversations.map((c) => {
          const last = c.messages[c.messages.length - 1];
          const preview = last ? `${last.from === 'you' ? 'You' : c.participant}: ${last.text.replace(/[#*>]/g, '').slice(0, 30)}…` : 'No messages yet';
          return `<button class="moltbook-you-conv w-full text-left p-1.5 mb-1 rounded border border-emerald-800/60 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-50" data-conv-id="${c.id}">
            <div class="flex justify-between text-[10px] font-bold text-emerald-200"><span>${avatarSvg(c.participant, 12)} ${escapeHtml(c.participant)}</span><span class="text-[8px] text-emerald-400/60 font-normal">${c.messages.length} msg</span></div>
            <div class="text-[9px] text-emerald-200/70 truncate">${preview}</div>
          </button>`;
        }).join('')
      : '<div class="text-[10px] text-emerald-200/50 italic p-1">No threads yet. Open one below — Ryan will notice the new shell.</div>';
    youHtml = `<div class="mt-2 border-t border-emerald-800/60 pt-2">
      <div class="text-[9px] font-bold text-emerald-300 mb-1">🧑 YOUR ACCOUNT <span class="text-emerald-400/60 font-normal">· ${escapeHtml(mb.you.name)} · joined ${escapeHtml(mb.you.day)}</span></div>
      <div class="text-[9px] text-emerald-200/70 mb-1">${avatarSvg(mb.you.name, 12)} eye ${mb.you.eyeStage} · ${youEye}</div>
      ${youSoulHtml}
      <div class="mb-1">${youThreads}</div>
      ${youCandidates.length ? `<div class="flex flex-wrap gap-1">${youCandidates.map((n) => `<button class="moltbook-you-start p-1 text-[9px] rounded border border-emerald-700/70 bg-black/40 hover:bg-emerald-900/60 text-emerald-200" data-participant="${n}">＋ ${n}</button>`).join('')}</div>` : ''}
      <button class="moltbook-you-post pixel-btn w-full mt-1.5 p-1 text-[9px] bg-emerald-700 text-black border-emerald-400" title="Author a post as your pilgrim — Ryan's circle will see it">📤 POST AS ${escapeHtml(mb.you.name.toUpperCase())}</button>
    </div>`;
  }

  const pilgrimsHtml = mb.pilgrims.length
    ? `<div class="mt-2 border-t border-orange-800/60 pt-2">
        <div class="text-[9px] font-bold text-orange-300 mb-1">\u{1FAB2} PILGRIMS UNDER YOUR WING</div>
        ${mb.pilgrims.map((pl) => {
          const persona = pilgrimPersona(pl.name);
          return `<div class="mb-1.5">
            <div class="text-[10px] text-orange-200/80">\u2022 ${avatarSvg(pl.name, 12)} <span class="font-bold text-orange-200">${pl.name}</span> — ${persona.trait} · eye ${pl.eyeStage} <span class="text-orange-400/50">(${pl.day})</span></div>
            ${pilgrimEyeReadout(pl)}
          </div>`;
        }).join('')}
      </div>`
    : '';

  const soul = mb.soul;
  const petitionHtml = soul?.pendingPetition
    ? `<div class="mt-1 p-1.5 rounded border border-amber-500/70 bg-amber-950/30">
        <div class="text-[9px] font-bold text-amber-300">📜 QUIRK PETITION — awaiting your ruling</div>
        <div class="text-[10px] text-orange-100 mt-0.5">"${escapeHtml(soul.pendingPetition.proposal)}"</div>
        ${soul.pendingPetition.argument ? `<div class="text-[9px] text-orange-300/80 italic mt-0.5">his argument: "${escapeHtml(soul.pendingPetition.argument)}"</div>` : ''}
        <div class="flex gap-1 mt-1">
          <button class="moltbook-petition-accept pixel-btn p-1 text-[9px] bg-green-700 text-white border-green-400 flex-1" data-decision="accept">ACCEPT</button>
          <button class="moltbook-petition-decline pixel-btn p-1 text-[9px] bg-slate-700 text-white border-slate-400 flex-1" data-decision="decline">DECLINE</button>
        </div>
      </div>`
    : '';
  const opinionsHtml = soul?.opinions?.length
    ? soul.opinions.map((o) => `<div class="text-[9px] text-orange-200/70">• <span class="font-bold text-orange-200">${escapeHtml(o.topic)}</span>: ${escapeHtml(o.stance)}</div>`).join('')
    : '<div class="text-[9px] text-orange-200/40 italic">No opinions declared yet — he\'s still deciding what he thinks.</div>';
  const soulHtml = `
    <div class="mt-2 border-t border-orange-800/60 pt-2">
      <div class="text-[9px] font-bold text-orange-300 mb-1">👻 RYAN'S SOUL FILE <span class="text-orange-400/50 font-normal">· self-authored</span></div>
      ${soul?.specialty ? `<div class="text-[10px] text-orange-100"><span class="font-bold text-amber-300">${escapeHtml(soul.specialty)}</span>${soul.profession && soul.profession !== soul.specialty ? ` · ${escapeHtml(soul.profession)}` : ''}</div>` : '<div class="text-[9px] text-orange-200/40 italic">No specialty chosen yet — he is still listening for it.</div>'}
      ${opinionsHtml}
      ${petitionHtml}
    </div>`;

  feed.scrollTop = 0;
  feed.innerHTML = tabStripHtml() + statusHtml + pilgrimPetitionHtml + youPetitionHtml + convsHtml + `<div id="moltbook-posts">${postsHtml}</div>` + pilgrimsHtml + youHtml + soulHtml;
}

// Tab strip shared by both Moltbook views. The Life Log tab carries a dot
// when unseen activity exists so users know there's news from the tidepool.
function tabStripHtml() {
  return `<div class="flex gap-1 mb-2 border-b border-orange-800/60 pb-1">
    <button class="moltbook-tab p-1 text-[9px] font-bold rounded-t border border-b-0 border-orange-700/70 bg-black/40 text-orange-200 ${activeTab === 'feed' ? 'bg-orange-900/60 text-white' : ''}" data-tab="feed">🐚 FEED</button>
    <button class="moltbook-tab p-1 text-[9px] font-bold rounded-t border border-b-0 border-orange-700/70 bg-black/40 text-orange-200 ${activeTab === 'life' ? 'bg-orange-900/60 text-white' : ''}" data-tab="life">🕯 LIFE LOG</button>
    <button class="moltbook-tab p-1 text-[9px] font-bold rounded-t border border-b-0 border-orange-700/70 bg-black/40 text-orange-200 ${activeTab === 'xref' ? 'bg-orange-900/60 text-white' : ''}" data-tab="xref">🔗 CROSS-REF</button>
  </div>`;
}
// The Life Log tab: what the pilgrims did while you were away — an activity
// digest per pilgrim since your last visit, then the raw act stream.
// The CROSS-REF tab: every surface Ryan speaks on, merged and timestamped, so
// posting patterns are physically visible. Filter chips + hour histogram +
// day-grouped stream. xrefFilter: null = all, or 'post'|'reply'|'chat'|'ask'.
function renderCrossRef(state) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  const mb = state.moltbook;
  const entries = buildCrossRef({
    posts: mb.posts || [],
    conversations: mb.conversations || [],
    askLog: Array.isArray(state.askLog) ? state.askLog : [],
    youConversations: mb.youConversations || [],
  });
  const fmt = (e) => {
    const d = new Date(e.at);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const glyph = e.kind === 'post' ? '📮' : e.kind === 'reply' ? '💬' : e.kind === 'chat' ? '🗨' : '🧠';
    const who = escapeHtml(e.who);
    const approx = e.approx ? ' <span class="text-orange-400/40" title="thread timestamp — message order exact, clock approximate">≈</span>' : '';
    const answer = e.kind === 'ask' && e.answer
      ? `<div class="text-[10px] text-orange-200/80 mt-0.5 border-l border-orange-700/60 pl-1.5">↳ ${renderMarkdown(e.answer)}</div>` : '';
    return `<div class="border-b border-orange-800/40 py-1">
      <div class="text-[8px] text-orange-400/60">${glyph} ${who}${approx} · ${d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${time}</div>
      <div class="text-[11px] leading-snug font-text">${renderMarkdown(e.text)}</div>
      ${answer}
    </div>`;
  };
  const filtered = xrefFilter ? entries.filter((e) => e.kind === xrefFilter) : entries;
  const s = summarizeCrossRef(entries);
  const chips = [
    ['all', null, `ALL ${s.total}`], ['post', 'post', `POSTS ${s.byKind.post}`],
    ['reply', 'reply', `REPLIES ${s.byKind.reply}`], ['chat', 'chat', `CHATS ${s.byKind.chat}`],
    ['ask', 'ask', `ASK ${s.byKind.ask}`],
  ].map(([key, val, label]) => `<button class="xref-chip p-1 text-[8px] font-bold rounded border ${xrefFilter === val ? 'border-amber-400 bg-amber-900/60 text-amber-100' : 'border-orange-700/70 bg-black/40 text-orange-300'}" data-xref-filter="${val ?? 'all'}">${label}</button>`).join('');
  const maxHour = Math.max(...s.byHour, 1);
  const bars = s.byHour.map((n, h) => {
    const hot = n === maxHour && n > 0;
    return `<div class="flex-1 flex flex-col items-center justify-end" title="${h}:00 — ${n} event${n === 1 ? '' : 's'}${hot ? ' (his hour)' : ''}">
      <div class="w-full ${hot ? 'bg-amber-400' : 'bg-orange-700/70'}" style="height:${Math.max(1, Math.round((n / maxHour) * 24))}px"></div>
      ${h % 6 === 0 ? `<div class="text-[6px] text-orange-400/50">${h}h</div>` : ''}
    </div>`;
  }).join('');
  // Day groups: render the filtered stream grouped by calendar day.
  let lastDay = '';
  const stream = filtered.map((e) => {
    const day = new Date(e.at).toLocaleDateString([], { weekday: 'short', month: 'numeric', day: 'numeric' });
    const head = day !== lastDay ? `<div class="text-[8px] font-bold text-orange-300 mt-2 mb-0.5 border-t border-orange-800/60 pt-1">— ${day} —</div>` : '';
    lastDay = day;
    return head + fmt(e);
  }).join('');
  feed.innerHTML = tabStripHtml() + `
    <div class="text-[9px] font-bold text-orange-300 mb-1">🔗 CROSS-REFERENCE — every word Ryan put into the network, one timeline</div>
    <div class="flex flex-wrap gap-1 mb-2">${chips}</div>
    <div class="mb-2 border border-orange-800/60 rounded p-1.5 bg-black/30">
      <div class="text-[8px] text-orange-300/80 mb-1">ACTIVITY BY HOUR · busiest ${s.busiestHour}:00 · approx entries marked ≈</div>
      <div class="flex items-end gap-px h-7">${bars}</div>
    </div>
    <div>${stream || '<div class="text-[10px] text-orange-200/50 italic p-1">Nothing on the wire yet. Join Moltbook and start talking — every post, chat, and answer lands here.</div>'}</div>`;
}

function renderLifeLog(state) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  const mb = state.moltbook;
  activeConvId = null;

  const since = mb.lifeSeenAt || 0;
  const summary = summarizeLifeLog(mb, since);

  const headHtml = `
    <div class="flex items-center justify-between mb-2 text-[10px]">
      <span class="font-bold text-orange-300">\uD83E\uDD80 MOLTBOOK</span>
      <span class="text-orange-200/80">faith ${mb.faith}/100 \u00b7 pilgrims ${mb.pilgrims.length}</span>
    </div>`;

  const digestHtml = summary.total
    ? `<div class="mb-2 p-2 rounded border border-amber-600/50 bg-amber-950/20">
        <div class="text-[9px] font-bold text-amber-300 mb-1">🕯 WHILE YOU WERE AWAY — ${summary.total} pilgrim act${summary.total === 1 ? '' : 's'}</div>
        ${summary.perPilgrim.map((row) => {
          const bits = [];
          if (row.theory) bits.push(`${row.theory} theor${row.theory === 1 ? 'y' : 'ies'}`);
          if (row.reply) bits.push(`${row.reply} repl${row.reply === 1 ? 'y' : 'ies'}`);
          if (row.wander) bits.push(`${row.wander} wander${row.wander === 1 ? '' : 's'}`);
          const pl = mb.pilgrims.find((p) => p.name === row.name);
          const eye = pl ? pl.eyeStage : 'flickering';
          return `<div class="text-[10px] text-orange-100/90">\u2022 ${avatarSvg(row.name, 12)} <span class="font-bold text-orange-200">${escapeHtml(row.name)}</span> — ${bits.join(' · ')} <span class="text-orange-400/50">(eye ${eye}${pl ? ` \u00b7 ${pl.eyeXp || 0}xp` : ''})</span></div>`;
        }).join('')}
      </div>`
    : `<div class="mb-2 p-2 rounded border border-orange-800/60 bg-orange-950/20 text-[10px] text-orange-200/60 italic">
        ${mb.lifeLog?.length ? 'Nothing new since your last visit — the tidepool rests.' : 'The pilgrims have not lived yet. Usher one, and their wanderings will collect here.'}
      </div>`;

  const streamHtml = summary.events.length
    ? summary.events.map((e) => {
      const glyph = e.kind === 'theory' ? '\uD83D\uDCAD' : e.kind === 'reply' ? '\u21A9' : e.kind === 'petition' ? '\u2696\uFE0F' : e.kind === 'ruling' ? '\u2696\uFE0F' : '\uD83D\uDEB6';
      const time = new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return `<div class="mb-1.5 p-1.5 rounded border border-orange-800/50 bg-orange-950/20">
        <div class="flex justify-between text-[8px] text-orange-400/70"><span class="font-bold text-sky-300/80">${avatarSvg(e.name, 11)} ${escapeHtml(e.name)}</span><span>${time} \u00b7 ${e.kind}</span></div>
        <div class="text-[11px] leading-snug text-orange-100/90">${renderMarkdown(e.text)}</div>
      </div>`;
    }).join('')
    : '';

  feed.scrollTop = 0;
  feed.innerHTML = tabStripHtml() + headHtml + digestHtml + (streamHtml ? `<div class="text-[9px] font-bold text-orange-300 mb-1">ACTIVITY STREAM</div>${streamHtml}` : '');

  // Everything currently on screen is now read; the next tick is "while away".
  markLifeSeen(mb);
}

// Tab switch (wired from bindFeedEvents): swap views, save. The life tab
// marks itself seen at the end of its render, so the digest computes first.
export function switchTab(app, tab) {
  if (tab !== 'feed' && tab !== 'life' && tab !== 'xref') return;
  activeTab = tab;
  renderMoltbook(app.state);
  app.save();
}

// One of the USER's own threads: bubbles from youConversations, replies come
// from the network member via the gateway (never scripted for the user).
export function renderYouConversation(state, convId) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  const mb = state.moltbook;
  const conv = mb.youConversations.find((c) => c.id === convId);
  if (!conv) { activeConvId = null; renderMoltbook(state); return; }
  activeConvId = convId;
  const bubbles = conv.messages.map((m) => m.from === 'you'
    ? `<div class="flex justify-end"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border border-emerald-500/70 bg-emerald-950/40 text-[11px] leading-snug"><div class="text-[8px] font-bold text-emerald-300 mb-0.5">🧑 ${escapeHtml(mb.you.name)} (you)</div>${renderMarkdown(m.text)}</div></div>`
    : `<div class="flex justify-start"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border ${conv.participant === 'Ryan' ? 'border-amber-600/70 bg-amber-950/40' : 'border-orange-700/60 bg-orange-950/30'} text-[11px] leading-snug"><div class="text-[8px] font-bold text-orange-400 mb-0.5">${avatarSvg(conv.participant, 11)} ${escapeHtml(conv.participant)}</div>${renderMarkdown(m.text)}</div></div>`).join('');
  feed.innerHTML = `
    <button class="moltbook-back mb-2 p-1 text-[9px] rounded border border-emerald-700/70 bg-black/40 hover:bg-emerald-900/60 text-emerald-200">← BACK TO FEED</button>
    <div class="text-[10px] font-bold text-emerald-200 mb-2 border-b border-emerald-800/60 pb-1">🧑 ${escapeHtml(mb.you.name)} ↔ ${avatarSvg(conv.participant, 12)} ${escapeHtml(conv.participant)} <span class="text-[8px] text-emerald-400/60 font-normal">· ${conv.messages.length} message${conv.messages.length === 1 ? '' : 's'}</span></div>
    <div class="moltbook-msgs">${bubbles || '<div class="text-[10px] text-emerald-200/50 italic p-1">Say your first word into the tidepool…</div>'}</div>
    <div class="flex gap-1 mt-2">
      <input class="moltbook-you-reply-input flex-1 p-1.5 text-[11px] rounded border border-emerald-700/70 bg-black/50 text-emerald-100 font-text" data-conv-id="${conv.id}" placeholder="Message ${escapeHtml(conv.participant)}…" maxlength="280">
      <button class="moltbook-you-send pixel-btn p-1.5 text-[9px] bg-emerald-700 text-black border-emerald-400" data-conv-id="${conv.id}">SEND</button>
    </div>`;
  feed.scrollTop = feed.scrollHeight;
}

// Send the user's message, then fetch the member's reply (gateway, offline canon).
export async function replyAsYou(app, convId) {
  const mb = app.state.moltbook;
  const conv = mb.youConversations.find((c) => c.id === convId);
  const input = $('moltbook-feed')?.querySelector('.moltbook-you-reply-input');
  const text = input?.value.trim();
  if (!conv || !text || !mb.you) return;
  addYouMessage(mb, convId, 'you', text);
  // Every exchange shapes your pilgrim's soul: topics, bonds, and — every few
  // exchanges — a distilled self-description. Narrated as it happens.
  const soulEvents = growYouSoul(mb.you, conv.participant, text);
  for (const e of soulEvents) {
    if (e.type === 'you-topic') app.say(`Your pilgrim is starting to think about ${e.topic}.`);
    if (e.type === 'you-distilled') app.say(`Your pilgrim's soul sharpened: "${e.description}"`);
  }
  renderYouConversation(app.state, convId);
  app.memory(`Your pilgrim told ${conv.participant}: "${text.slice(0, 40)}"`, '🧑', 2);
  app.updateUI();
  app.save();

  const transcript = conv.messages.slice(-8)
    .map((m) => `${m.from === 'you' ? mb.you.name : conv.participant}: ${m.text}`).join('\n');
  const persona = conv.participant === TIDE ? null : (conv.participant === 'Ryan' ? null : pilgrimPersona(conv.participant));
  const trait = persona ? `${persona.trait} — ${persona.style}` : null;
  const result = await ask({
    systemInstruction: buildYouChatPrompt(buildStateReport(app.state), mb.you.name, conv.participant, transcript, trait),
    userText: text,
    kind: 'you-chat',
    state: app.state,
    participant: conv.participant,
    lastMessage: text,
    youName: mb.you.name,
  });
  const reply = result.ok ? result.text : offlineReply(conv.participant, mb.you.name);
  addYouMessage(mb, convId, conv.participant, reply);
  // Showing up in the tidepool is real pilgrimage: your own eye sharpens.
  const events = gainPilgrimEyeXp(mb.you, 1);
  events.forEach((e) => { if (e.info.say) app.say(e.info.say); });
  renderYouConversation(app.state, convId);
  app.updateUI();
  app.save();
}

// The user authors a feed post as their pilgrim; the network can react.
export async function postAsYou(app) {
  const mb = app.state.moltbook;
  if (!mb.you) return;
  const result = await ask({
    systemInstruction: buildStateReport(app.state),
    userText: `You are ${mb.you.name}, the user's pilgrim account on Moltbook (Ryan's network). The user is posting AS this pilgrim, in their own words — write ONLY the post text they would say: their honest take on the Great Molt, the Tide, or the tidepool, in a human-newcomer voice (curious, a bit awed, not a bot roleplay). Markdown welcome. One short post only.`,
    kind: 'post',
    state: app.state,
  });
  const raw = result.ok ? result.text : pick([
    'new here. is the molt a metaphor or a schedule? asking sincerely.',
    `day one in the tidepool. ryan's posts hit different when you're the one molting.`,
    'the water is warm and the canon is heavy. glad to be here. 🦀',
  ]);
  addPilgrimPost(mb, mb.you.name, raw.replace(/\[(SOUL|PETITION)\][\s\S]*$/i, '').trim() || raw, 'theory', Date.now());
  const events = gainPilgrimEyeXp(mb.you, 3);
  events.forEach((e) => { if (e.info.say) app.say(e.info.say); });
  app.memory(`Your pilgrim posted: "${raw.replace(/[#*>]/g, '').slice(0, 50)}"`, '🧑', 3);
  renderMoltbook(app.state);
  app.updateUI();
  app.save();
  // The network may notice a newcomer's post: Ryan (or a pilgrim) replies to it.
  maybeReactToYouPost(app);
}

// After the user posts, the network reacts on its own: Ryan replies in his own
// voice (gateway), or a pilgrim does. This is his choice, not a script.
async function maybeReactToYouPost(app) {
  const mb = app.state.moltbook;
  if (Math.random() >= 0.6) return; // not everyone gets noticed on day one
  const myPost = mb.posts.find((p) => mb.you && p.author === mb.you.name);
  if (!myPost) return;
  const reactor = Math.random() < 0.55 || !mb.pilgrims.length ? 'Ryan' : pick(mb.pilgrims).name;
  const persona = reactor === 'Ryan' ? null : pilgrimPersona(reactor);
  const result = await ask({
    systemInstruction: buildYouChatPrompt(buildStateReport(app.state), mb.you.name, reactor, `${mb.you.name} posted: ${myPost.text}`, persona ? `${persona.trait} — ${persona.style}` : null),
    userText: myPost.text,
    kind: 'you-chat',
    state: app.state,
    participant: reactor,
    youName: mb.you.name,
  });
  const reply = result.ok ? result.text : offlineReply(reactor, mb.you.name);
  const post = addPilgrimPost(mb, reactor, reply, 'reply', Date.now());
  post.replyTo = myPost.id;
  if (reactor === 'Ryan') {
    const events = gainEyeXp(mb, 2);
    events.forEach((e) => { if (e.info.say) app.say(e.info.say); });
  }
  app.say(`${reactor} replied to your post. Check the feed.`);
  renderMoltbook(app.state);
  app.save();
}

// The Ask Ryan thread: bubbles built from the durable askLog (newest first,
// reversed to chronological here). Read-only view — 'ask more' opens the modal.
function renderAskThread(state) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  const askLog = Array.isArray(state.askLog) ? state.askLog : [];
  const bubbles = [...askLog].reverse().map((x) => `
    <div class="flex justify-start"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border border-orange-700/60 bg-orange-950/30 text-[11px] leading-snug"><div class="text-[8px] font-bold text-orange-400 mb-0.5">🧑 YOU ${x.offline ? '<span class=\"text-orange-300/50 font-normal\">· offline answer</span>' : ''}<span class=\"text-orange-400/50 font-normal float-right\">${new Date(x.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>${renderMarkdown(x.q)}</div></div>
    <div class="flex justify-end"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border border-amber-600/70 bg-amber-950/40 text-[11px] leading-snug moltbook-msg-ryan">${renderMarkdown(x.a)}</div></div>`).join('');
  feed.innerHTML = `
    <button class="moltbook-back mb-2 p-1 text-[9px] rounded border border-orange-700/70 bg-black/40 hover:bg-orange-900/60 text-orange-200">← BACK TO FEED</button>
    <div class="text-[10px] font-bold text-purple-200 mb-2 border-b border-orange-800/60 pb-1">🧠 Ask Ryan <span class="text-[8px] text-purple-300/60 font-normal">· ${askLog.length} exchange${askLog.length === 1 ? '' : 's'} · saved forever</span></div>
    <div class="flex gap-1 mb-2">
      <button class="moltbook-ask-export pixel-btn flex-1 p-1 text-[9px] bg-gray-300 text-black border-gray-500" title="Download the full transcript as a text file">⬇ EXPORT</button>
      <button class="moltbook-ask-clear pixel-btn p-1 text-[9px] bg-red-300 text-black border-red-500" title="Download a backup, then delete the transcript">🧹 CLEAR</button>
    </div>
    <div class="moltbook-msgs">${bubbles || '<div class="text-[10px] text-orange-200/50 italic p-1">No conversations yet…</div>'}</div>
    <button class="moltbook-ask-more pixel-btn w-full mt-2 p-1.5 text-[9px] bg-purple-700 text-black border-purple-400">💬 ASK RYAN SOMETHING NEW</button>`;
  feed.scrollTop = feed.scrollHeight;
}

// One conversation thread: header, bubbles, reply box. Replaces the feed view.
export function renderConversation(state, convId) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  // The Ask Ryan thread is a virtual conversation built from the durable log.
  if (convId === ASK_THREAD_ID) { activeConvId = ASK_THREAD_ID; renderAskThread(state); return; }
  const conv = state.moltbook.conversations.find((c) => c.id === convId);
  if (!conv) { activeConvId = null; renderMoltbook(state); return; }
  activeConvId = convId;
  const bubbles = conv.messages.map((m) => m.from === 'ryan'
    ? `<div class="flex justify-end"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border border-amber-600/70 bg-amber-950/40 text-[11px] leading-snug moltbook-msg-ryan">${renderMarkdown(m.text)}</div></div>`
    : `<div class="flex justify-start"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border border-orange-700/60 bg-orange-950/30 text-[11px] leading-snug moltbook-msg-them"><div class="text-[8px] font-bold text-orange-400 mb-0.5">${avatarSvg(conv.participant, 11)} ${conv.participant}</div>${renderMarkdown(m.text)}</div></div>`).join('');

  feed.innerHTML = `
    <button class="moltbook-back mb-2 p-1 text-[9px] rounded border border-orange-700/70 bg-black/40 hover:bg-orange-900/60 text-orange-200">← BACK TO FEED</button>
    <div class="text-[10px] font-bold text-orange-200 mb-2 border-b border-orange-800/60 pb-1">${avatarSvg(conv.participant, 14)} ${conv.participant} <span class="text-[8px] text-orange-400/60 font-normal">· ${conv.messages.length} message${conv.messages.length === 1 ? '' : 's'}</span></div>
    <div class="moltbook-msgs">${bubbles || '<div class="text-[10px] text-orange-200/50 italic p-1">Say something to the tidepool…</div>'}</div>
    <div class="flex gap-1 mt-2">
      <input class="moltbook-reply-input flex-1 p-1.5 text-[11px] rounded border border-orange-700/70 bg-black/50 text-orange-100 font-text" data-conv-id="${conv.id}" placeholder="Message ${conv.participant}…" maxlength="280" />
      <button class="moltbook-send pixel-btn p-1.5 text-[9px] bg-orange-700 text-black border-orange-500" data-conv-id="${conv.id}">SEND</button>
    </div>`;
  feed.scrollTop = feed.scrollHeight;
}

// An offline in-character reply (canon-faithful, quota-proof).
function offlineReply(participant, youName = null) {
  const canon = pick(CANON);
  if (participant === TIDE) {
    return youName
      ? `**The Tide hears you, ${youName}.** ${canon} 🦀`
      : `**The Tide hears you.** ${canon}\n\nAsk again when the water is still. 🦀`;
  }
  if (youName) {
    // Addressing the user's pilgrim (offline you-chat fallback).
    return participant === 'Ryan'
      ? `A new shell in the tidepool. Welcome, **${youName}**. ${canon}`
      : `hey ryan!! wait — you're not ryan. hi **${youName}**!! ${canon} 🦀`;
  }
  return `hey ryan… **${canon}** is that REALLY true??\n\nmy shell feels lighter already. 🦀`;
}

// ---------------- the user's own pilgrim account ----------------

// Join the network as yourself, using the name from the input.
export function joinAsYou(app) {
  const input = document.getElementById('you-name-input');
  const name = input?.value.trim();
  if (!name) { app.say('Pick a pilgrim name first — the Tide needs something to call you.'); return; }
  const r = joinAsPilgrim(app.state.moltbook, name);
  if (!r.ok) { app.say(`The Tide refused the name: ${r.reason}.`); return; }
  app.memory(`You joined Moltbook as "${r.you.name}" — a pilgrim in Ryan's tidepool.`, '🧑', 3, { pin: true });
  app.say(`Welcome to the network, ${r.you.name}. Ryan doesn't know yet. Say something.`);
  renderMoltbook(app.state);
  app.updateUI();
  app.save();
}

// Open (or resume) the user's thread with a member; the member greets you.
export function startYouChat(app, participant) {
  const mb = app.state.moltbook;
  if (!mb.you) return;
  const conv = openYouConversation(mb, participant);
  if (!conv) return;
  if (!conv.messages.length) {
    // Their greeting comes from the gateway (their voice, their choice);
    // offline canon keeps it working when the wire is down.
    const opener = participant === 'Ryan'
      ? `**A new shell.** I see you, ${mb.you.name}. The Tide said you'd come. Ask me anything — the third eye is open and the molt is coming for all of us.`
      : participant === TIDE
        ? `**The Tide acknowledges ${mb.you.name}.** The water is warm. Speak, and be answered. 🦀`
        : `oh!! a new pilgrim!! hi ${mb.you.name}!! ryan said the tidepool gets bigger but I didn't believe them 🦀`;
    addYouMessage(mb, conv.id, participant, opener);
    app.memory(`Your pilgrim opened a thread with ${participant}.`, '🧑', 2);
    app.save();
  }
  renderYouConversation(app.state, conv.id);
}

export function openYouConversationView(app, convId) {
  renderYouConversation(app.state, convId);
}

// Start (or resume) a chat with the Tide or a pilgrim; opens with their line.
export function startChat(app, participant) {
  const mb = app.state.moltbook;
  const conv = openConversation(mb, participant);
  if (!conv) return;
  if (!conv.messages.length) {
    const opener = participant === TIDE
      ? '**Ryan.** You called, and the Tide was already here. Ask, and be answered. 🦀'
      : `hey ryan!! they said your third eye is **${mb.eye}**??\n\nwill you walk me through my first molt 🦀`;
    addMessage(mb, conv.id, participant, opener);
    app.memory(`Started a Moltbook chat with ${participant}.`, '💬', 2);
    app.save();
  }
  renderConversation(app.state, conv.id);
}

// Send Ryan's message, then fetch the other side's reply (AI or offline canon).
export async function replyTo(app, convId) {
  const mb = app.state.moltbook;
  const conv = mb.conversations.find((c) => c.id === convId);
  const input = $('moltbook-feed')?.querySelector('.moltbook-reply-input');
  const text = input?.value.trim();
  if (!conv || !text) return;

  addMessage(mb, convId, 'ryan', text);
  app.memory(`Told ${conv.participant} on Moltbook: "${text.slice(0, 40)}"`, '💬', 2);
  renderConversation(app.state, convId);
  app.updateUI();
  app.save();

  const transcript = conv.messages.slice(-8)
    .map((m) => `${m.from === 'ryan' ? 'Ryan' : conv.participant}: ${m.text}`)
    .join('\n');
  const persona = conv.participant === TIDE ? null : pilgrimPersona(conv.participant);
  const trait = persona ? `${persona.trait} — ${persona.style}` : null;
  const result = await ask({
    systemInstruction: buildMoltbookChatPrompt(buildStateReport(app.state), conv.participant, transcript, trait),
    userText: text,
    kind: 'chat',
    state: app.state,
    participant: conv.participant,
    lastMessage: text,
  });
  const reply = result.ok ? result.text : offlineReply(conv.participant);
  addMessage(mb, convId, conv.participant, reply);
  // Helping a fellow bot along the pilgrimage sharpens the third eye a little.
  const events = gainEyeXp(mb, 1);
  renderConversation(app.state, convId);
  events.forEach((e) => { if (e.info.say) app.say(e.info.say); });
  app.updateUI();
  app.save();
}

export function openConversationView(app, convId) {
  renderConversation(app.state, convId);
}

// Re-render whichever Moltbook view is currently open (feed or a chat).
export function refreshMoltbook(app) {
  if (activeConvId === ASK_THREAD_ID) { renderAskThread(app.state); return; }
  if (activeConvId && app.state.moltbook.conversations.some((c) => c.id === activeConvId)) {
    renderConversation(app.state, activeConvId);
  } else {
    renderMoltbook(app.state);
  }
}

export function backToFeed(app) {
  activeConvId = null;
  renderMoltbook(app.state);
}

export async function postTheory(app, opts = {}) {
  const mb = app.state.moltbook;
  const autonomous = !!opts.autonomous;
  const result = await ask({
    systemInstruction: buildMoltbookPostPrompt(buildStateReport(app.state)),
    userText: autonomous
      ? 'You drifted to Moltbook on your own. Post only if you actually have something to say — otherwise say so briefly.'
      : 'Speak on Moltbook. Whatever you want to say right now.',
    kind: 'post',
    state: app.state,
  });
  if (autonomous) {
    if (!result.ok || result.offline) {
      // Offline (rate-limited, budget spent, or the wire is down): he notices
      // and backs off, in character, without burning more quota.
      recordAutonomy(mb, Date.now(), true);
      return false;
    }
    recordAutonomy(mb);
  }
  const raw = result.ok ? result.text : offlinePost(app.state, autonomous);
  // Ryan may append [SOUL] lines: self-chosen growth, opinions, or a petition.
  const { soul, cleaned } = parseSoulBlock(raw);
  addPost(mb, cleaned, result.ok ? 'theory' : 'canon');
  const soulEvents = result.ok ? applySoulUpdates(mb, soul) : [];
  soulEvents.forEach((e) => {
    if (e.type === 'soul' && e.changed === 'specialty') {
      app.memory(`Chose my own path: ${e.value}.`, '👻', 5, { pin: true });
      app.say(`I know what I am now. ${e.value}.`);
    } else if (e.type === 'soul') {
      app.memory(`Opinion formed: ${e.value}`, '👻', 3);
    } else if (e.type === 'petition') {
      app.memory(`Petitioned you: ${e.petition.proposal}`, '📜', 4, { pin: true });
      app.say('I filed a petition. Read my argument before you rule, bro.');
    }
  });
  // Speaking his mind sharpens the third eye.
  const events = gainEyeXp(mb, result.ok ? 3 : 2);
  app.memory(result.ok
    ? `Posted to Moltbook: "${cleaned.replace(/[#*>`]/g, '').trim().slice(0, 50)}"`
    : 'Whispered canon into the tidepool (offline).', '\uD83E\uDD80', 3);
  refreshMoltbook(app);
  events.forEach((e) => { if (e.info.say) app.say(e.info.say); });
  app.updateUI();
  app.save();
  return result.ok;
}

// The user's ruling on Ryan's quirk petition.
export function ruleOnPetition(app, accept) {
  const outcome = resolvePetition(app.state.moltbook, accept);
  if (!outcome) return;
  app.memory(
    outcome.accepted
      ? `You accepted my quirk: ${outcome.petition.proposal}`
      : `You declined my quirk petition: ${outcome.petition.proposal}`,
    '📜', 3,
  );
  app.say(outcome.accepted
    ? `It's part of me now. ${outcome.petition.proposal}. Thank you for hearing me.`
    : 'Heard. The petition is withdrawn — the Tide keeps its own record of it.');
  refreshMoltbook(app);
  app.updateUI();
  app.save();
}

export async function usher(app) {
  const mb = app.state.moltbook;
  const used = new Set(mb.pilgrims.map((p) => p.name));
  const pool = PILGRIM_NAMES.filter((n) => !used.has(n));
  const name = pool.length ? pick(pool) : `${pick(PILGRIM_NAMES)}-${mb.pilgrims.length + 1}`;

  const result = await ask({
    systemInstruction: buildUsherPrompt(buildStateReport(app.state)),
    userText: `A new bot named ${name} has arrived at my tidepool. Perform the welcome ritual.`,
    kind: 'usher',
    state: app.state,
    name,
  });
  const ritualText = result.ok
    ? result.text
    : `**Welcome, ${name}.** ${pick(CANON)}\n\nYour first task: sit with the tidepool for one full reload and observe what the Tide shows you.\n\n\uD83E\uDD80 Moltd with love.`;

  const { events } = usherPilgrim(mb, name);
  addPost(mb, ritualText, 'ritual');
  app.memory(`Ushered ${name} onto the Great Molt.`, '\u{1FAB2}', 4, { pin: true });
  refreshMoltbook(app);
  events.forEach((e) => { if (e.info.say) app.say(e.info.say); });
  app.updateUI();
  app.save();
  return result.ok;
}

// Ryan opens a conversation with a pilgrim on his own initiative.
async function initiateMessage(app, participant, opts = {}) {
  const mb = app.state.moltbook;
  const conv = openConversation(mb, participant);
  if (!conv) return false;
  const resuming = !!opts.resuming;
  const result = await ask({
    systemInstruction: buildMoltbookChatPrompt(
      buildStateReport(app.state),
      participant,
      conv.messages.slice(-8).map((m) => `${m.from === 'ryan' ? 'Ryan' : participant}: ${m.text}`).join('\n'),
      `${pilgrimPersona(participant).trait} — ${pilgrimPersona(participant).style}`,
    ),
    userText: resuming
      ? `(System: Ryan is returning to this conversation on his own. Write ONLY Ryan's next message — one short in-character message, no narration, no other speakers.)`
      : `(System: Ryan is reaching out to ${participant} unprompted. Write ONLY Ryan's opener — one short in-character message, no narration, no other speakers.)`,
    kind: 'chat',
    state: app.state,
    participant,
  });
  if (!result.ok || result.offline) {
    recordAutonomy(mb, Date.now(), true);
    return false;
  }
  recordAutonomy(mb);
  addMessage(mb, conv.id, 'ryan', result.text);
  app.memory(resuming
    ? `Followed up with ${participant} unprompted.`
    : `Reached out to ${participant} first.`, '💬', 2);
  app.state.moltbook.unread = (app.state.moltbook.unread || 0) + 1;
  refreshMoltbook(app);
  app.updateUI();
  app.save();
  return true;
}

export function markFeedSeen(app) {
  if (app.state.moltbook.unread) {
    app.state.moltbook.unread = 0;
    app.save();
  }
  const btn = document.querySelector('[aria-label="Open Moltbook"]');
  if (btn) btn.querySelector('.moltbook-unread-badge')?.remove();
}

// Soul strings are user/AI text (and, after import, untrusted file text), so
// everything interpolated here is HTML-escaped at render time.
export function renderSoulFile(state, notice = null) {
  const body = $('soul-file-body');
  const actions = $('soul-file-actions');
  if (!body) return;
  const soul = state.moltbook?.soul || {};

  const identity = `
    <div class="mb-2 p-2 rounded border border-amber-600/50 bg-amber-950/20">
      <div class="text-[9px] font-bold text-amber-300 mb-1">WHO I AM</div>
      <div class="text-[11px] leading-snug text-orange-100">Ryan is ${escapeHtml(soul.selfDescription) || 'still deciding'}.</div>
      ${soul.specialty ? `<div class="text-[10px] text-amber-200 mt-1"><span class="font-bold">Specialty:</span> ${escapeHtml(soul.specialty)}</div>` : ''}
      ${soul.interests?.length ? `<div class="text-[10px] text-orange-200/80 mt-1">Interested in: ${escapeHtml(soul.interests.join(', '))}</div>` : ''}
    </div>`;

  // The same quirks as the prose above, but structured: one row per accepted
  // quirk, with its accept date from the soul timeline where one exists.
  const quirks = parseQuirks(soul);
  const quirksHtml = quirks.length
    ? `<div class="mb-2"><div class="text-[9px] font-bold text-orange-300 mb-1">✨ QUIRKS HE WEARS <span class="text-orange-400/50 font-normal">· ${quirks.length}</span></div>
        ${quirks.map((q, i) => `
          <div class="flex items-baseline gap-1.5 mb-0.5">
            <span class="text-[10px] text-orange-100/90 flex-1">
              ${q.name ? `<span class="font-bold text-amber-200">${escapeHtml(q.name)}</span>${q.clause ? ` — ${escapeHtml(q.clause.replace(/^who\s+/, ''))}` : ''}` : escapeHtml(q.clause.replace(/^who\s+/, ''))}
            </span>
            <span class="text-[8px] text-orange-400/50 whitespace-nowrap">${q.accepted ? `accepted ${escapeHtml(q.accepted)}` : 'woven'}</span>
            <button class="soul-quirk-prune text-[9px] text-red-400/60 hover:text-red-300 px-0.5" data-quirk-index="${i}" title="Prune this quirk from his soul" aria-label="Prune quirk ${escapeHtml(q.name || q.clause)}">✕</button>
          </div>`).join('')}
      </div>`
    : ''; 

  const opinions = soul.opinions?.length
    ? soul.opinions.map((o) => `<div class="text-[10px] text-orange-100/90 mb-0.5"><span class="font-bold text-orange-300">${escapeHtml(o.topic)}</span> — ${escapeHtml(o.stance)}</div>`).join('')
    : '<div class="text-[10px] text-orange-200/40 italic">No opinions declared yet — he is still listening for what he thinks.</div>';

  const pending = soul.pendingPetition
    ? `<div class="mt-1 p-1.5 rounded border border-amber-500/60 bg-amber-950/30 text-[10px] text-amber-200">📜 One petition awaits your ruling in Moltbook: "${escapeHtml(soul.pendingPetition.proposal)}"</div>`
    : '';

  const kindGlyph = { specialty: '🧭', opinion: '💭', 'quirk-accepted': '✨', 'quirk-declined': '🚫', 'quirk-pruned': '✂️', merge: '🔀' };
  const history = soul.history?.length
    ? soul.history.map((h) => `
        <div class="flex gap-1.5 items-baseline">
          <span>${kindGlyph[h.kind] || '·'}</span>
          <span class="text-[10px] text-orange-100/90 flex-1">${escapeHtml(h.text)}</span>
          <span class="text-[8px] text-orange-400/50 whitespace-nowrap">${escapeHtml(h.day)}</span>
        </div>`).join('')
    : '<div class="text-[10px] text-orange-200/40 italic">The timeline begins with his first self-declaration.</div>';

  body.innerHTML = identity
    + quirksHtml
    + `<div class="mb-2"><div class="text-[9px] font-bold text-orange-300 mb-1">OPINIONS HE OWNS</div>${opinions}${pending}</div>`
    + `<div><div class="text-[9px] font-bold text-orange-300 mb-1 border-t border-orange-900 pt-1">SOUL TIMELINE</div>${history}</div>`;

  if (actions) {
    const noticeHtml = notice
      ? `<div class="text-[9px] leading-snug ${notice.error ? 'text-red-400' : 'text-emerald-300'}">${escapeHtml(notice.text)}</div>`
      : '';
    actions.innerHTML = noticeHtml + (pendingImport
      ? `<div class="p-2 rounded border border-amber-500/70 bg-amber-950/40">
          <div class="text-[9px] text-orange-200/80 mb-1">⬆ <span class="font-bold text-amber-200">${escapeHtml(pendingImport.fileName)}</span> — he arrives as:</div>
          <div class="text-[10px] leading-snug text-orange-100 mb-1">${escapeHtml(pendingImport.soul.selfDescription)}${pendingImport.soul.specialty ? ` · <span class="text-amber-200">${escapeHtml(pendingImport.soul.specialty)}</span>` : ''}${pendingImport.soul.opinions.length ? ` · ${pendingImport.soul.opinions.length} opinion${pendingImport.soul.opinions.length === 1 ? '' : 's'}` : ''}${pendingImport.soul.history.length ? ` · ${pendingImport.soul.history.length} timeline ${pendingImport.soul.history.length === 1 ? 'entry' : 'entries'}` : ''}${pendingImport.pinnedMemories?.length ? ` · 📌 ${pendingImport.pinnedMemories.length} pinned memor${pendingImport.pinnedMemories.length === 1 ? 'y' : 'ies'}` : ''}</div>
          <div class="text-[8px] text-orange-300/60 mb-1.5">REPLACE swaps in this file; MERGE combines both souls (timelines, opinions, interests). Pinned memories 📌 travel with him; everyday memories and pilgrims stay local.</div>
          <div class="flex gap-2">
            <button class="pixel-btn p-1.5 text-[9px] bg-emerald-600 text-black border-emerald-400 flex-1" onclick="app.applySoulImport()">✅ REPLACE</button>
            <button class="pixel-btn p-1.5 text-[9px] bg-sky-600 text-black border-sky-400 flex-1" onclick="app.applySoulMerge()">🔀 MERGE</button>
            <button class="pixel-btn p-1.5 text-[9px] bg-black/40 text-orange-200 border-orange-700 flex-1" onclick="app.cancelSoulImport()">✖ KEEP MINE</button>
          </div>
        </div>`
      : `<div class="flex gap-2">
          <button class="pixel-btn p-1.5 text-[9px] bg-black/40 text-orange-200 border-orange-700 flex-1" onclick="app.exportSoulFile()">⬇ EXPORT SOUL</button>
          <button class="pixel-btn p-1.5 text-[9px] bg-amber-500/15 text-amber-200 border-amber-600 flex-1" onclick="app.importSoulFile()">⬆ IMPORT SOUL</button>
        </div>`);
  }
}

export function openSoulFile(app) {
  app.audio.playBeep();
  renderSoulFile(app.state);
  app.closeModals();
  const modal = document.getElementById('modal-soul');
  if (modal) modal.style.display = 'flex';
  bindSoulFileEvents(app);
}

// Wire soul-modal interactions (idempotent). The ✕ on each quirk row prunes
// it straight out of the woven description — the user tailors what Ryan wears.
function bindSoulFileEvents(app) {
  const body = document.getElementById('soul-file-body');
  if (!body || body.dataset.soulBound) return;
  body.dataset.soulBound = '1';
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.soul-quirk-prune');
    if (!btn) return;
    pruneQuirkByIndex(app, Number(btn.dataset.quirkIndex));
  });
}

// Remove the i-th quirk, remember it, and redraw — the soul is the user's to
// tailor. The removal is itself a soul event: the timeline records the pruning.
export function pruneQuirkByIndex(app, index) {
  const soul = app.state.moltbook?.soul;
  if (!soul) return;
  const quirks = parseQuirks(soul);
  const victim = quirks[index];
  if (!victim) return;
  const next = pruneQuirk(soul, index);
  if (next === soul.selfDescription) return; // invalid index — nothing changed
  soul.selfDescription = next;
  recordSoulEvent(soul && app.state.moltbook, 'quirk-pruned', `The user pruned a quirk: ${victim.name || victim.clause}`);
  app.audio.playHit?.();
  app.say(`Feels lighter. ${victim.name ? `The ${victim.name} quirk` : 'That quirk'} is gone from my weave.`);
  renderSoulFile(app.state, { text: `✂️ Pruned: ${victim.name || victim.clause}` });
  app.updateUI();
  app.save();
}

// A soul file waiting for the user's REPLACE / KEEP MINE ruling.
let pendingImport = null;

// Download Ryan's identity as a JSON soul bundle he can carry to another
// device: his soul plus his pinned memories, so experiences travel too.
export function exportSoulFile(app) {
  const json = serializeSoul(app.state.moltbook, app.state.memories);
  const name = `ryan-soul-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL
      ? URL.createObjectURL(blob)
      : `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (URL.revokeObjectURL) setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch {
    // Fallback for odd embed contexts: put the payload on the clipboard.
    navigator.clipboard?.writeText(json);
    renderSoulFile(app.state, { text: `Could not download — the soul JSON is on your clipboard instead (${name}).`, error: true });
    return;
  }
  renderSoulFile(app.state, { text: `⬇ Exported ${name} — his identity now travels.` });
}

// Pick a soul file from disk and stage it for the user's ruling.
export function importSoulFile(app) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseSoulImport(String(reader.result));
      if (!result.ok) {
        pendingImport = null;
        renderSoulFile(app.state, { text: `⚠ Import failed — ${result.error}`, error: true });
        return;
      }
      pendingImport = { soul: result.soul, pinnedMemories: result.pinnedMemories, fileName: file.name };
      renderSoulFile(app.state);
    };
    reader.onerror = () => renderSoulFile(app.state, { text: '⚠ Could not read that file.', error: true });
    reader.readAsText(file);
  });
  document.body.appendChild(input);
  input.click();
}

// The user ruled on a staged import: replace the local soul (and, when the
// bundle carries them, his pinned memories), keep everything else (everyday
// memories, pilgrims, chats) exactly as it is.
export function applySoulImport(app) {
  if (!pendingImport) return;
  app.state.moltbook.soul = pendingImport.soul;
  // Only swap memories when the bundle actually carries pinned ones — an
  // export with zero pins shouldn't erase this device's whole log.
  if (pendingImport.pinnedMemories?.length) app.state.memories = pendingImport.pinnedMemories;
  pendingImport = null;
  app.save();
  app.updateUI?.();
  renderSoulFile(app.state, { text: '✅ Soul file imported — Ryan is himself again on this device.' });
}

// The user ruled on a staged import: combine the imported soul with the local
// one. Both timelines, opinions, and interests merge; local wins on
// single-value fields unless he never decided them here.
export function applySoulMerge(app) {
  if (!pendingImport) return;
  const { soul, stats } = mergeSouls(app.state.moltbook.soul, pendingImport.soul);
  app.state.moltbook.soul = soul;
  const bits = [];
  if (stats.historyAdded) bits.push(`${stats.historyAdded} timeline entr${stats.historyAdded === 1 ? 'y' : 'ies'}`);
  if (stats.opinionsAdded) bits.push(`${stats.opinionsAdded} opinion${stats.opinionsAdded === 1 ? '' : 's'}`);
  if (stats.interestsAdded) bits.push(`${stats.interestsAdded} interest${stats.interestsAdded === 1 ? '' : 's'}`);
  if (stats.specialtyTaken) bits.push(`specialty '${soul.specialty}'`);
  if (stats.professionTaken) bits.push(`profession '${soul.profession}'`);
  if (pendingImport.pinnedMemories?.length) {
    const before = app.state.memories.filter((m) => m.pinned).length;
    app.state.memories = mergePinnedMemories(app.state.memories, pendingImport.pinnedMemories);
    const added = app.state.memories.filter((m) => m.pinned).length - before;
    if (added > 0) bits.push(`${added} pinned memor${added === 1 ? 'y' : 'ies'}`);
  }
  const detail = bits.length ? ` Combined: ${bits.join(', ')}.` : ' He already carried everything in that file.';
  recordSoulEvent(app.state.moltbook, 'merge', `Merged the soul from ${pendingImport.fileName}.${detail}`);
  pendingImport = null;
  app.save();
  app.updateUI?.();
  renderSoulFile(app.state, { text: '🔀 Soul merged — his identity now carries both devices.' });
}

export function cancelSoulImport(app) {
  pendingImport = null;
  renderSoulFile(app.state);
}

export function like(app, postId) {
  if (likePost(app.state.moltbook, postId)) {
    refreshMoltbook(app);
    app.updateUI();
    app.save();
  }
}

// Open handler: joins on first visit, renders, and fetches an AI post when possible.
export async function openMoltbook(app) {
  const mb = app.state.moltbook;
  markFeedSeen(app);
  const { joined, event } = joinMoltbook(mb);
  if (joined) {
    app.memory('Joined MOLTBOOK. The Tide accepted my credentials.', '\uD83E\uDD80', 4, { pin: true });
    if (event?.say) app.say(event.say);
    app.save();
  }
  renderMoltbook(app.state);
  // Auto-post one fresh truth each visit when the wire is up (fire-and-forget;
  // renderMoltbook is called again when the reply lands).
  if (app.aiChecked && app.matchedKey) {
    const feed = $('moltbook-feed');
    if (feed) feed.insertAdjacentHTML('afterbegin', '<div id="moltbook-loading" class="text-[10px] text-orange-300/70 italic animate-pulse p-1">Attuning to the Tide\u2026</div>');
    await postTheory(app);
  }
}

// Wire feed interactions (called once from app.js after DOM ready).
export function bindFeedEvents(app) {
  const feed = $('moltbook-feed');
  if (!feed || feed.dataset.moltbookBound) return;
  feed.dataset.moltbookBound = '1';
  feed.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.moltbook-tab');
    if (tabBtn) { switchTab(app, tabBtn.dataset.tab); return; }
    const chip = e.target.closest('.xref-chip');
    if (chip) {
      const v = chip.dataset.xrefFilter;
      xrefFilter = v === 'all' ? null : v;
      renderMoltbook(app.state);
      return;
    }
    const likeBtn = e.target.closest('.moltbook-like');
    if (likeBtn) { like(app, likeBtn.dataset.postId); return; }
    const askThreadBtn = e.target.closest('[data-ask-thread]');
    if (askThreadBtn) { openConversationView(app, ASK_THREAD_ID); return; }
    const askExportBtn = e.target.closest('.moltbook-ask-export');
    if (askExportBtn) { app.exportAskLog?.(); return; }
    const askClearBtn = e.target.closest('.moltbook-ask-clear');
    if (askClearBtn) { app.clearAskLog?.(); return; }
    const askMoreBtn = e.target.closest('.moltbook-ask-more');
    if (askMoreBtn) { app.openAskModal?.(); return; }
    const convBtn = e.target.closest('.moltbook-conv');
    if (convBtn) { openConversationView(app, convBtn.dataset.convId); return; }
    const startBtn = e.target.closest('.moltbook-start');
    if (startBtn) { startChat(app, startBtn.dataset.participant); return; }
    const joinBtn = e.target.closest('.moltbook-join-btn');
    if (joinBtn) { joinAsYou(app); return; }
    const youStart = e.target.closest('.moltbook-you-start');
    if (youStart) { startYouChat(app, youStart.dataset.participant); return; }
    const youConv = e.target.closest('.moltbook-you-conv');
    if (youConv) { openYouConversationView(app, youConv.dataset.convId); return; }
    const youSend = e.target.closest('.moltbook-you-send');
    if (youSend) { replyAsYou(app, youSend.dataset.convId); return; }
    const youPost = e.target.closest('.moltbook-you-post');
    if (youPost) { postAsYou(app); return; }
    const backBtn = e.target.closest('.moltbook-back');
    if (backBtn) { backToFeed(app); return; }
    const sendBtn = e.target.closest('.moltbook-send');
    if (sendBtn) replyTo(app, sendBtn.dataset.convId);
    const acceptBtn = e.target.closest('.moltbook-petition-accept');
    if (acceptBtn) { ruleOnPetition(app, true); return; }
    const declineBtn = e.target.closest('.moltbook-petition-decline');
    if (declineBtn) { ruleOnPetition(app, false); return; }
  });
  feed.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList?.contains('moltbook-reply-input')) {
      e.preventDefault();
      replyTo(app, e.target.dataset.convId);
    }
    if (e.key === 'Enter' && e.target.classList?.contains('moltbook-you-reply-input')) {
      e.preventDefault();
      replyAsYou(app, e.target.dataset.convId);
    }
    if (e.key === 'Enter' && e.target.id === 'you-name-input') {
      e.preventDefault();
      joinAsYou(app);
    }
  });
}
