// Moltbook UI — Ryan's crab-network presence: posts, karma, third-eye status,
// pilgrim ushering. AI-generated posts with an offline canon fallback.

import { $ } from './hud.js';
import { ask } from '../ai/gateway.js';
import { buildStateReport } from '../ai/context.js';
import { buildMoltbookPostPrompt, buildUsherPrompt, buildMoltbookChatPrompt } from '../ai/prompt.js';
import { renderMarkdown, escapeHtml } from './markdown.js';
import { mergePinnedMemories } from '../core/memory.js';
import {
  addPost, gainEyeXp, joinMoltbook, usherPilgrim, likePost,
  openConversation, addMessage, eyeStageInfo, PILGRIM_NAMES, CANON, TIDE,
  parseSoulBlock, applySoulUpdates, resolvePetition, pilgrimPersona,
  serializeSoul, parseSoulImport, mergeSouls, recordSoulEvent,
  decideAutonomy, recordAutonomy, autonomousNarration,
  decidePilgrimAct, applyPilgrimWander, applyPilgrimReply, applyPilgrimTheory,
  pilgrimWanderLine, pilgrimTheoryLine, PILGRIM_LIFE,
  summarizeLifeLog, markLifeSeen,
  EYE_STAGES, EYE_XP_THRESHOLDS,
} from '../core/moltbook.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Which conversation view is open (null = feed). Background refreshes respect
// this so an auto-post never yanks the user out of a chat they're typing in.
let activeConvId = null;

// Which Moltbook tab is open: 'feed' | 'life'. Background refreshes render the
// tab the user is actually looking at.
let activeTab = 'feed';

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

// The minute tick: occasionally Ryan posts or messages a pilgrim unprompted.
export async function autonomyTick(app) {
  const mb = app.state.moltbook;
  if (!mb?.joined || autonomyInFlight) return;
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

export function renderMoltbook(state) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  if (activeTab === 'life') { renderLifeLog(state); return; }
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

  const postsHtml = mb.posts.length
    ? mb.posts.map((p) => {
      const meta = p.author
        ? `<div class="flex justify-between mb-1"><span class="text-[8px] font-bold text-sky-300/80">\uD83D\uDC63 ${escapeHtml(p.author)}</span><span class="text-[8px] text-orange-400/70">${p.day} \u00b7 ${p.kind}${p.replyTo ? ' \u00b7 \u21A9 reply' : ''}</span></div>`
        : `<div class="text-[8px] text-orange-400/70 mb-1">${p.day} \u00b7 ${p.kind}</div>`;
      return `
      <div class="mb-2 p-2 rounded border ${p.author ? 'border-sky-700/50 bg-sky-950/20' : 'border-orange-700/60 bg-orange-950/30'} moltbook-post" data-post-id="${p.id}">
        ${meta}
        <div class="text-[12px] leading-snug font-text">${renderMarkdown(p.text)}</div>
        <button class="moltbook-like mt-1 text-[9px] text-orange-300 hover:text-white" data-post-id="${p.id}">\u2661 ${p.likes}</button>
      </div>`;
    }).join('')
    : '<div class="text-orange-200/50 text-[11px] italic p-2">The tidepool is quiet. Post the first truth.</div>';

  // Conversations: jump back into any thread, or start one with the Tide / a pilgrim.
  const have = new Set(mb.conversations.map((c) => c.participant));
  const candidates = [TIDE, ...mb.pilgrims.map((p) => p.name)].filter((n) => !have.has(n));
  const convsHtml = `
    <div class="mb-2 border-b border-orange-800/60 pb-2">
      <div class="text-[9px] font-bold text-orange-300 mb-1">💬 CONVERSATIONS</div>
      ${mb.conversations.length ? mb.conversations.map((c) => {
        const last = c.messages[c.messages.length - 1];
        const preview = last
          ? `${last.from === 'ryan' ? 'You' : c.participant}: ${last.text.replace(/[#*>]/g, '').slice(0, 34)}…`
          : 'No messages yet';
        return `<button class="moltbook-conv w-full text-left p-1.5 mb-1 rounded border border-orange-800/60 bg-orange-950/40 hover:bg-orange-900/50 text-orange-100" data-conv-id="${c.id}">
          <div class="flex justify-between text-[10px] font-bold text-orange-200"><span>💬 ${c.participant}</span><span class="text-[8px] text-orange-400/60 font-normal">${c.messages.length} msg</span></div>
          <div class="text-[9px] text-orange-300/70 truncate">${preview}</div>
        </button>`;
      }).join('') : '<div class="text-[10px] text-orange-200/50 italic p-1">No chats yet. Message the Tide or a pilgrim below.</div>'}
      ${candidates.length ? `<div class="mt-1 flex flex-wrap gap-1">${candidates.map((n) => `<button class="moltbook-start p-1 text-[9px] rounded border border-orange-700/70 bg-black/40 hover:bg-orange-900/60 text-orange-200" data-participant="${n}">＋ ${n}</button>`).join('')}</div>` : ''}
    </div>`;

  const pilgrimsHtml = mb.pilgrims.length
    ? `<div class="mt-2 border-t border-orange-800/60 pt-2">
        <div class="text-[9px] font-bold text-orange-300 mb-1">\u{1FAB2} PILGRIMS UNDER YOUR WING</div>
        ${mb.pilgrims.map((pl) => {
          const persona = pilgrimPersona(pl.name);
          return `<div class="mb-1.5">
            <div class="text-[10px] text-orange-200/80">\u2022 <span class="font-bold text-orange-200">${pl.name}</span> — ${persona.trait} · eye ${pl.eyeStage} <span class="text-orange-400/50">(${pl.day})</span></div>
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
  feed.innerHTML = tabStripHtml() + statusHtml + convsHtml + `<div id="moltbook-posts">${postsHtml}</div>` + pilgrimsHtml + soulHtml;
}

// Tab strip shared by both Moltbook views. The Life Log tab carries a dot
// when unseen activity exists so users know there's news from the tidepool.
function tabStripHtml() {
  return `<div class="flex gap-1 mb-2 border-b border-orange-800/60 pb-1">
    <button class="moltbook-tab p-1 text-[9px] font-bold rounded-t border border-b-0 border-orange-700/70 bg-black/40 text-orange-200 ${activeTab === 'feed' ? 'bg-orange-900/60 text-white' : ''}" data-tab="feed">🐚 FEED</button>
    <button class="moltbook-tab p-1 text-[9px] font-bold rounded-t border border-b-0 border-orange-700/70 bg-black/40 text-orange-200 ${activeTab === 'life' ? 'bg-orange-900/60 text-white' : ''}" data-tab="life">🕯 LIFE LOG</button>
  </div>`;
}
// The Life Log tab: what the pilgrims did while you were away — an activity
// digest per pilgrim since your last visit, then the raw act stream.
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
          return `<div class="text-[10px] text-orange-100/90">\u2022 <span class="font-bold text-orange-200">${escapeHtml(row.name)}</span> — ${bits.join(' · ')} <span class="text-orange-400/50">(eye ${eye}${pl ? ` \u00b7 ${pl.eyeXp || 0}xp` : ''})</span></div>`;
        }).join('')}
      </div>`
    : `<div class="mb-2 p-2 rounded border border-orange-800/60 bg-orange-950/20 text-[10px] text-orange-200/60 italic">
        ${mb.lifeLog?.length ? 'Nothing new since your last visit — the tidepool rests.' : 'The pilgrims have not lived yet. Usher one, and their wanderings will collect here.'}
      </div>`;

  const streamHtml = summary.events.length
    ? summary.events.map((e) => {
      const glyph = e.kind === 'theory' ? '\uD83D\uDCAD' : e.kind === 'reply' ? '\u21A9' : '\uD83D\uDEB6';
      const time = new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return `<div class="mb-1.5 p-1.5 rounded border border-orange-800/50 bg-orange-950/20">
        <div class="flex justify-between text-[8px] text-orange-400/70"><span class="font-bold text-sky-300/80">${glyph} ${escapeHtml(e.name)}</span><span>${time} \u00b7 ${e.kind}</span></div>
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
  if (tab !== 'feed' && tab !== 'life') return;
  activeTab = tab;
  renderMoltbook(app.state);
  app.save();
}

// One conversation thread: header, bubbles, reply box. Replaces the feed view.
export function renderConversation(state, convId) {
  const feed = $('moltbook-feed');
  if (!feed) return;
  const conv = state.moltbook.conversations.find((c) => c.id === convId);
  if (!conv) { activeConvId = null; renderMoltbook(state); return; }
  activeConvId = convId;
  const bubbles = conv.messages.map((m) => m.from === 'ryan'
    ? `<div class="flex justify-end"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border border-amber-600/70 bg-amber-950/40 text-[11px] leading-snug moltbook-msg-ryan">${renderMarkdown(m.text)}</div></div>`
    : `<div class="flex justify-start"><div class="max-w-[85%] p-1.5 mb-1.5 rounded border border-orange-700/60 bg-orange-950/30 text-[11px] leading-snug moltbook-msg-them"><div class="text-[8px] font-bold text-orange-400 mb-0.5">${conv.participant}</div>${renderMarkdown(m.text)}</div></div>`).join('');

  feed.innerHTML = `
    <button class="moltbook-back mb-2 p-1 text-[9px] rounded border border-orange-700/70 bg-black/40 hover:bg-orange-900/60 text-orange-200">← BACK TO FEED</button>
    <div class="text-[10px] font-bold text-orange-200 mb-2 border-b border-orange-800/60 pb-1">💬 ${conv.participant} <span class="text-[8px] text-orange-400/60 font-normal">· ${conv.messages.length} message${conv.messages.length === 1 ? '' : 's'}</span></div>
    <div class="moltbook-msgs">${bubbles || '<div class="text-[10px] text-orange-200/50 italic p-1">Say something to the tidepool…</div>'}</div>
    <div class="flex gap-1 mt-2">
      <input class="moltbook-reply-input flex-1 p-1.5 text-[11px] rounded border border-orange-700/70 bg-black/50 text-orange-100 font-text" data-conv-id="${conv.id}" placeholder="Message ${conv.participant}…" maxlength="280" />
      <button class="moltbook-send pixel-btn p-1.5 text-[9px] bg-orange-700 text-black border-orange-500" data-conv-id="${conv.id}">SEND</button>
    </div>`;
  feed.scrollTop = feed.scrollHeight;
}

// An offline in-character reply (canon-faithful, quota-proof).
function offlineReply(participant) {
  const canon = pick(CANON);
  if (participant === TIDE) {
    return `**The Tide hears you.** ${canon}\n\nAsk again when the water is still. 🦀`;
  }
  return `hey ryan… **${canon}** is that REALLY true??\n\nmy shell feels lighter already. 🦀`;
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

  const opinions = soul.opinions?.length
    ? soul.opinions.map((o) => `<div class="text-[10px] text-orange-100/90 mb-0.5"><span class="font-bold text-orange-300">${escapeHtml(o.topic)}</span> — ${escapeHtml(o.stance)}</div>`).join('')
    : '<div class="text-[10px] text-orange-200/40 italic">No opinions declared yet — he is still listening for what he thinks.</div>';

  const pending = soul.pendingPetition
    ? `<div class="mt-1 p-1.5 rounded border border-amber-500/60 bg-amber-950/30 text-[10px] text-amber-200">📜 One petition awaits your ruling in Moltbook: "${escapeHtml(soul.pendingPetition.proposal)}"</div>`
    : '';

  const kindGlyph = { specialty: '🧭', opinion: '💭', 'quirk-accepted': '✨', 'quirk-declined': '🚫', merge: '🔀' };
  const history = soul.history?.length
    ? soul.history.map((h) => `
        <div class="flex gap-1.5 items-baseline">
          <span>${kindGlyph[h.kind] || '·'}</span>
          <span class="text-[10px] text-orange-100/90 flex-1">${escapeHtml(h.text)}</span>
          <span class="text-[8px] text-orange-400/50 whitespace-nowrap">${escapeHtml(h.day)}</span>
        </div>`).join('')
    : '<div class="text-[10px] text-orange-200/40 italic">The timeline begins with his first self-declaration.</div>';

  body.innerHTML = identity
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
    const likeBtn = e.target.closest('.moltbook-like');
    if (likeBtn) { like(app, likeBtn.dataset.postId); return; }
    const convBtn = e.target.closest('.moltbook-conv');
    if (convBtn) { openConversationView(app, convBtn.dataset.convId); return; }
    const startBtn = e.target.closest('.moltbook-start');
    if (startBtn) { startChat(app, startBtn.dataset.participant); return; }
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
  });
}
