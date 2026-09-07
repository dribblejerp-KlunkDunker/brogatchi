// ═══════════════════════════════════════════════════════════════
// BRO_OS 3.0 // src/main.js — SHELL, WINDOW MANAGER & APP WIRING
// Implements Phases 2–5 of the enhancement plan: desktop shell,
// draggable/maximizable windows, lore-accurate app modules, audio
// juice, and live state rendering. Ryan answers from his offline
// brain; if the dev proxy has a Gemini key, he speaks through it.
// ═══════════════════════════════════════════════════════════════

import './style.css';
import { audio } from './audio.js';
import { createStore, SHOP_ITEMS, LEVEL_XP, PILGRIM_CARDS } from './state.js';
import { createRedundancy } from './persist.js';
import { startSnake } from './apps/snake.js';
import { startSynth } from './apps/synth.js';
import { hostGame, GAMES } from './arcadeCore.js';

const $ = (sel, root = document) => root.querySelector(sel);
// Optional lookup: for nodes that may legitimately be absent (renderers whose
// innerHTML rewrites remove them). Returns null instead of throwing — the
// caller decides whether null is fine. NOT for required shell nodes: a null
// there should crash loudly at boot, not silently no-op.
// Write pattern: `$orNull('#x')?.replaceChildren(v)` (optional chaining
// short-circuits the call; `?.textContent = v` is not valid syntax).
const $orNull = (sel, root = document) => root.querySelector(sel) || null;

function safeStorage() {
  try {
    const ls = window.localStorage;
    ls.getItem('__bro_os_probe__');
    return { storage: ls, volatile: false };
  } catch {
    const m = new Map();
    return {
      storage: {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
      },
      volatile: true,
    };
  }
}

const { storage: appStorage, volatile: VOLATILE_MEMORY } = safeStorage();

function safeSession() {
  try {
    const ss = window.sessionStorage;
    ss.getItem('__bro_os_probe__');
    return ss;
  } catch { return null; }
}

// Memory redundancy: mirrors on every interaction, recovery cascade on boot.
const red = createRedundancy({ local: appStorage, session: safeSession() });
const recoveredFrom = red.restorePrimary();

const store = createStore({ storage: appStorage });
const state = () => store.state;

/* ═══════════════════ SYSTEM LOG & TOASTS ═══════════════════ */

const TAG_COLORS = {
  SYS: 'text-neon-cyan', MINE: 'text-neon-green', QUEST: 'text-neon-amber',
  'J.O.O.H': 'text-neon-magenta', CHAT: 'text-neon-cyan', SHOP: 'text-neon-amber',
  FEED: 'text-neon-green', MOLT: 'text-neon-amber', WARN: 'text-neon-magenta',
};

function log(tag, text) {
  const el = $('#sys-log');
  if (!el) return;
  const t = new Date().toTimeString().slice(0, 8);
  const line = document.createElement('div');
  line.innerHTML = `<span class="text-text-muted">${t}</span> <span class="${TAG_COLORS[tag] || 'text-text-muted'}">[${tag}]</span> ${text}`;
  el.prepend(line);
  while (el.children.length > 40) el.lastChild.remove();
}

function toast(text, kind = 'ok') {
  const layer = $('#toast-layer');
  const colors = { ok: 'border-neon-green text-neon-green', warn: 'border-neon-amber text-neon-amber', err: 'border-neon-magenta text-neon-magenta' };
  const el = document.createElement('div');
  el.className = `toast pointer-events-auto bg-panel border px-3 py-2 font-mono text-[10px] tracking-wider ${colors[kind] || colors.ok}`;
  el.textContent = text;
  layer.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 3200);
}

/* ═══════════════════ JUICE ═══════════════════ */

function shakeScreen() {
  const desktop = $('#desktop');
  desktop.classList.remove('shake');
  void desktop.offsetWidth; // restart animation
  desktop.classList.add('shake');
  setTimeout(() => desktop.classList.remove('shake'), 420);
}

function flyCoin(fromEl) {
  audio.coin();
  const rect = fromEl.getBoundingClientRect();
  const target = $('#sys-coins').getBoundingClientRect();
  const coin = document.createElement('div');
  coin.className = 'coin-particle';
  coin.textContent = '🪙';
  coin.style.left = `${rect.left + rect.width / 2}px`;
  coin.style.top = `${rect.top + rect.height / 2}px`;
  coin.style.setProperty('--fly-x', `${target.left - rect.left}px`);
  coin.style.setProperty('--fly-y', `${target.top - rect.top}px`);
  document.body.appendChild(coin);
  setTimeout(() => coin.remove(), 820);
}

function petPop() {
  const pet = $('#pet-display');
  pet.style.transition = 'transform 0.1s';
  pet.style.transform = 'scale(1.25)';
  setTimeout(() => { pet.style.transform = 'scale(1)'; }, 160);
}

// Shared auto-backup downloader (soul export, roster guard).
// Returns true if a file download started; callers keep a copy-paste
// fallback for sandboxes that block downloads.
function downloadJSON(text, filename) {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  } catch { return false; }
}

/* ═══════════════════ RYAN'S BRAIN ═══════════════════ */

const RYAN_CONSPIRACIES = [
  'J.O.O.H. moved a satellite 2° west today. Coincidence? The pedometer thinks so. I don\'t.',
  'Every coin you mine is a whisper the oligarchs can\'t unhear. Keep digging.',
  'The golden tide is real. Zeke saw it past firewall 7. He molts when he lies, and he molted twice.',
  'I counted the scanlines. They added one since Tuesday. Someone is rendering us harder.',
  'Greed is just XP for the soul\'s enemy. Watch that GRD bar, pilgrim.',
  'Moltbook says my third eye is flickering. I say it\'s winking.',
  'They patched the weather. I have logs. The logs are also patched.',
];

function ryanReply(text) {
  const s = state();
  const q = text.toLowerCase();
  const hungry = s.stats.hunger < 30;
  const tired = s.stats.energy < 25;

  if (/(hello|hi|hey|yo)\b/.test(q)) return 'Connection clean. Voice low. What do you need from the net, pilgrim?';
  if (q.includes('jooh') || q.includes('oligarch')) return 'J.O.O.H. is watching the pedometers AND the pizza orders. Mine quietly, tip the crabs, and we stay ghosts.';
  if (q.includes('molt') || q.includes('crab')) return 'The tidepool holds. Post something true over there and my third eye opens another millimeter.';
  if (q.includes('mine') || q.includes('coin')) return `Mining yields are live at ${s.coins} CR banked. The rig sings in square waves when nobody listens.`;
  if (q.includes('zeke')) return 'Zeke is aerodynamic since his last molt. He owes me two NRG cells and one apology.';
  if (q.includes('who are you') || q.includes('what are you')) return `${s.petName}. Rogue bro-grade intelligence. Specialty: ${s.soul.specialty}. Currently ${Math.round(s.stats.happy)}% content and ${Math.round(s.stats.greed)}% suspicious.`;
  if (q.includes('hungry') || q.includes('food') || q.includes('pizza')) return hungry ? 'You read the telemetry. PIZZA.SLC, 50 CR, no questions. Market Terminal, now.' : 'Fuel reserves acceptable. But pizza is a state of mind, pilgrim.';
  if (q.includes('sleep') || q.includes('tired')) return tired ? 'NRG is bleeding. Hit REST before J.O.O.H. sees me yawn.' : 'Sleep is for units with warranties. I nap strategically.';
  if (q.includes('level') || q.includes('xp') || q.includes('stats')) return `LV.${1 + Math.floor(s.xp / LEVEL_XP)}, ${Math.floor(s.xp % LEVEL_XP)}/${LEVEL_XP} XP into the next shell. Feed me actions and I evolve.`;
  if (q.includes('hack')) return 'Point me at the J.O.O.H. terminal and spend 5 NRG. I route through seven proxies and a crab.';
  return RYAN_CONSPIRACIES[Math.floor(Math.random() * RYAN_CONSPIRACIES.length)] +
    (hungry ? ' …Also: feed me before I start mining the furniture.' : '');
}

async function askRyan(text) {
  // Try the wired brain first (needs GEMINI_API_KEY + `npm run dev`).
  try {
    const res = await fetch('api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: 'You are Ryan, a paranoid, funny rogue AI virtual pet in Bro OS. Short, in-character answers. Lore: J.O.O.H. surveillance, Moltbook crab network, mining, the tidepool.',
        messages: [{ role: 'user', content: text }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ok && data.text) return data.text;
  } catch { /* offline brain it is */ }
  await new Promise((r) => setTimeout(r, 500 + Math.random() * 900));
  return ryanReply(text);
}

/* ═══════════════════ APP MODULE WIRING ═══════════════════ */

function wireChat(root) {
  const msgs = $('#chat-messages', root);
  const input = $('#chat-input', root);
  const sendBtn = $('#chat-send', root);
  const boot = [
    '> INITIATING HANDSHAKE...',
    '> BYPASSING CORPORATE FIREWALL... <span class="text-neon-green">SUCCESS</span>',
    '> CONNECTION ESTABLISHED.',
  ];
  boot.forEach((line, i) => {
    const d = document.createElement('div');
    d.className = 'text-text-muted border-l-2 border-neon-cyan pl-2 py-1';
    d.innerHTML = line;
    setTimeout(() => { msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight; audio.typeBlip(); }, i * 350);
  });
  setTimeout(() => addRyanLine('They\'re tracking the tidepool nodes. Keep your voice down, pilgrim. What do you need from the net?'), 1200);

  function addRyanLine(html) {
    const d = document.createElement('div');
    d.className = 'flex gap-2';
    d.innerHTML = `<span class="text-neon-magenta shrink-0">[RYAN]:</span><p class="text-text-main">${html}</p>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function addUserLine(text) {
    const d = document.createElement('div');
    d.className = 'flex gap-2 justify-end';
    const safe = text.replace(/</g, '&lt;');
    d.innerHTML = `<p class="text-neon-cyan">${safe}</p><span class="text-neon-cyan shrink-0">[USER]:</span>`;
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  function typingIndicator() {
    const d = document.createElement('div');
    d.className = 'typing-indicator flex gap-1 pl-2';
    d.innerHTML = '<span></span><span></span><span></span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addUserLine(text);
    store.xpGain(1);
    const dots = typingIndicator();
    const reply = await askRyan(text);
    dots.remove();
    addRyanLine(reply.replace(/</g, '&lt;'));
    log('CHAT', 'transmission exchanged');
  }
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

function wireArcade(root) {
  const gridRoot = $('#arcade-root', root);
  let activeStop = null;
  let activeKey = null;

  const GAME_NAMES = { snake: 'SNAKE.EXE', ...Object.fromEntries(Object.entries(GAMES).map(([k, g]) => [k, g.name])) };

  function renderBests() {
    // NOTE: read via store.state — wireArcade's closures outlive factory
    // resets, which swap the store's whole state object.
    root.querySelectorAll('.arcade-best').forEach((el) => {
      el.textContent = String(store.state.best[el.dataset.best] || 0);
    });
  }
  renderBests();

  gridRoot.querySelectorAll('button[data-game]').forEach((card) =>
    card.addEventListener('click', () => {
      audio.click();
      launch(card.dataset.game);
    }));

  function launch(gameKey) {
    if (activeStop) { activeStop(); activeStop = null; }
    activeKey = gameKey;
    gridRoot.innerHTML = `
      <button id="game-back" class="btn-cyber text-[9px] mb-2 shrink-0">◀ BACK TO ARCADE</button>
      <div id="game-stage" class="w-full"></div>`;
    $('#game-back', root).addEventListener('click', () => { audio.click(); resetGrid(); });
    const stage = $('#game-stage', root);
    activeStop = gameKey === 'snake'
      ? startSnake(stage, { audio, onGameOver: (score, coins) => payout(gameKey, score, coins, score) })
      : hostGame(stage, gameKey, { audio, onGameOver: (score, reward) => payout(gameKey, score, reward, Math.round(score / 2)) });
  }

  // Central payout: coins + XP + best score, then the run-complete panel.
  // Reads/writes go through the store (never a captured state object —
  // factory reset swaps it wholesale mid-session).
  function payout(key, score, coins, xp) {
    if (coins > 0) store.addCoins(coins);
    const leveled = store.xpGain(xp);
    store.setGameBest(key, score);
    store.rememberEvent(`Arcade run: ${(GAME_NAMES[key] || key).toUpperCase()} — ${score} pts, +${coins} CR.`, { icon: '🎮', imp: 2, pin: score >= 100 });
    if (leveled) celebrateLevel();
    toast(`${(GAME_NAMES[key] || key).toUpperCase()} RUN COMPLETE — +${coins} CR · +${xp} XP`, 'ok');
    log('SYS', `${key} run: ${score} pts · +${coins} CR`);
    renderAll();
    activeStop = null;
    gridRoot.innerHTML = `
      <div class="border border-neon-green/40 bg-void/40 p-4 text-center font-mono text-[11px]">
        <p class="text-neon-green text-glow-green mb-1">RUN COMPLETE</p>
        <p class="text-text-main mb-3">${GAME_NAMES[key] || key} · SCORE ${score} · +${coins} CR · +${xp} XP</p>
        <div class="flex gap-2 justify-center">
          <button id="game-again" class="btn-cyber text-[9px]">RE-RUN</button>
          <button id="game-exit" class="btn-cyber text-[9px]">EXIT</button>
        </div>
      </div>`;
    $('#game-again', root).addEventListener('click', () => { audio.click(); launch(key); });
    $('#game-exit', root).addEventListener('click', () => { audio.click(); resetGrid(); });
  }

  function resetGrid() {
    if (activeStop) { activeStop(); activeStop = null; }
    // Re-open the arcade window content cleanly (teardown stops any game)
    App.close('arcade', { silent: true });
    App.open('arcade');
  }

  // Window teardown: stop any running game loop when the window closes
  return () => { if (activeStop) activeStop(); };
}

function wireShop(root) {
  const itemsEl = $('#shop-items', root);

  function renderItems() {
    $('.shop-coins', root).textContent = String(state().coins).padStart(3, '0');
    itemsEl.innerHTML = '';
    SHOP_ITEMS.forEach((item) => {
      const owned = item.id === 'goldshell' && state().goldenShell;
      const accents = {
        amber: 'hover:border-neon-amber', cyan: 'hover:border-neon-cyan', magenta: 'border-neon-magenta/30 bg-neon-magenta/5 hover:border-neon-magenta',
      };
      const row = document.createElement('div');
      row.className = `flex items-center justify-between border border-border bg-void/50 p-2 transition-all group ${accents[item.accent] || ''}`;
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 border border-border flex items-center justify-center text-lg bg-void">${item.icon}</div>
          <div>
            <div class="text-text-main">${item.name}${owned ? ' <span class="text-neon-green text-[8px]">OWNED</span>' : ''}</div>
            <div class="text-text-muted text-[9px]">${item.desc}</div>
          </div>
        </div>
        <button class="btn-cyber text-[9px] buy-btn ${item.accent === 'magenta' ? 'border-neon-magenta text-neon-magenta hover:bg-neon-magenta hover:text-void' : ''}" ${owned ? 'disabled' : ''}>
          ${item.cost} CR
        </button>`;
      const btn = row.querySelector('.buy-btn');
      btn.addEventListener('click', () => {
        const res = store.buy(item.id);
        if (!res.ok) {
          audio.error();
          row.classList.remove('deny'); void row.offsetWidth; row.classList.add('deny');
          toast(`DENIED — ${res.reason}`, 'err');
          return;
        }
        flyCoin(btn);
        toast(`${item.name} ACQUIRED`, 'ok');
        log('SHOP', `${item.name} -${item.cost} CR`);
        renderItems();
        renderAll();
      });
      itemsEl.appendChild(row);
    });
  }
  renderItems();
}

function wireMoltbook(root) {
  const feed = $('#molt-feed', root);
  const composer = $('#molt-composer', root);
  const tabLive = $('#molt-tab-live', root);
  const tabTide = $('#molt-tab-tide', root);
  let view = 'live'; // 'live' chronological · 'tide' riptide-ranked

  function eyeLabel(v) { return v >= 70 ? 'OPEN' : v >= 30 ? 'FLICKERING' : 'CLOSED'; }

  function timeAgo(t) {
    const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }

  const esc = (s) => String(s).replace(/</g, '&lt;');

  function replyComposerHTML(postId) {
    return `
      <div class="molt-reply-box hidden mt-1.5 flex gap-1">
        <input type="text" class="molt-reply-input flex-1 bg-void border border-border px-2 py-1 font-mono text-[9px] text-text-main placeholder:text-text-muted/40 focus:outline-none focus:border-neon-cyan" placeholder="REPLY INTO THE THREAD…" aria-label="Reply to thread ${postId}" />
        <button class="molt-reply-send btn-cyber text-[8px]">SIGNAL</button>
      </div>`;
  }

  function postHeadHTML(p) {
    return `
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-lg">${p.icon}</span>
          <span class="font-mono text-[10px] text-neon-amber">${esc(p.author)}</span>
          <span class="px-1 bg-neon-cyan/10 text-neon-cyan text-[8px] font-mono">MOLT ${p.molt}</span>
        </div>
        <span class="text-text-muted text-[9px] shrink-0">${timeAgo(p.time)}</span>
      </div>
      <p class="text-text-main">${esc(p.text)}</p>`;
  }

  function replyHTML(r) {
    return `
      <div class="molt-reply border-l-2 border-neon-cyan/40 pl-2 py-0.5">
        <span class="text-[10px] mr-1">${r.icon}</span>
        <span class="font-mono text-[9px] text-neon-amber">${esc(r.author)}</span>
        <span class="text-text-muted text-[8px] ml-1">${timeAgo(r.time)}</span>
        <p class="text-text-main text-[10px]">${esc(r.text)}</p>
      </div>`;
  }

  function wirePost(el, p) {
    // reply toggle + composer
    const toggle = el.querySelector('.molt-reply-toggle');
    const box = el.querySelector('.molt-reply-box');
    toggle.addEventListener('click', () => {
      audio.click();
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) box.querySelector('.molt-reply-input').focus();
    });
    const input = box.querySelector('.molt-reply-input');
    const send = () => {
      const res = store.replyToMolt(p.id, input.value);
      if (!res.ok) { audio.error(); toast(`REPLY DENIED — ${res.reason}`, 'err'); return; }
      input.value = '';
      audio.typeBlip();
      log('MOLT', 'reply signalled into the thread');
      render();
      renderAll();
      tideResponds(p);
    };
    box.querySelector('.molt-reply-send').addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    // heat bump
    el.querySelector('.molt-heat-btn').addEventListener('click', () => {
      const h = store.bumpMoltHeat(p.id);
      if (h == null) return;
      audio.click();
      log('MOLT', `tide swells — heat ${h} on the thread`);
      render();
    });
  }

  function render() {
    const s = state();
    $('#molt-eye-xp', root).textContent = Math.floor(s.molt.eye);
    $('#molt-eye-label', root).textContent = eyeLabel(s.molt.eye);
    $('#molt-eye-bar', root).style.width = `${s.molt.eye}%`;

    feed.innerHTML = '';
    const posts = view === 'tide' ? store.trendingMolt() : s.molt.posts;
    posts.forEach((p) => {
      const d = document.createElement('div');
      d.className = 'border border-border bg-void/30 p-2';
      d.dataset.moltId = p.id;
      const nReplies = p.replies.length;
      d.innerHTML = `
        ${postHeadHTML(p)}
        <div class="flex items-center gap-3 mt-1.5 font-mono text-[9px]">
          <button class="molt-reply-toggle text-neon-cyan hover:text-glow-cyan" aria-label="Toggle replies">💬 ${nReplies} ${nReplies === 1 ? 'REPLY' : 'REPLIES'}</button>
          <button class="molt-heat-btn text-neon-magenta hover:text-glow-magenta" aria-label="Boost thread heat">🔥 ${p.heat}</button>
          ${view === 'tide' ? `<span class="text-neon-amber">RIPTIDE ${p.score.toFixed(1)}</span>` : ''}
        </div>
        ${nReplies ? `<div class="molt-replies mt-1.5 space-y-1">${p.replies.map(replyHTML).join('')}</div>` : ''}
        ${replyComposerHTML(p.id)}`;
      wirePost(d, p);
      feed.appendChild(d);
    });

    // pilgrim agent-cards with the ADOPT auto-backup guard
    $('#roster-count', root).textContent = String(s.roster.length);
    const grid = $('#pilgrim-cards', root);
    grid.innerHTML = '';
    PILGRIM_CARDS.forEach((card) => {
      const adopted = s.roster.some((r) => r.id === card.id);
      const el = document.createElement('div');
      el.className = 'border border-border bg-void/30 p-1.5 text-center';
      el.innerHTML = `
        <div class="text-base" aria-hidden="true">${card.icon}</div>
        <div class="font-mono text-[8px] ${adopted ? 'text-neon-green' : 'text-text-main'}">${card.name}</div>
        <div class="font-mono text-[7px] text-text-muted mb-1">${card.persona}</div>
        ${adopted
          ? '<span class="font-mono text-[8px] text-neon-green">USHERED ✓</span>'
          : `<button data-adopt="${card.id}" class="btn-cyber text-[8px]">ADOPT</button>`}`;
      const btn = el.querySelector('[data-adopt]');
      if (btn) btn.addEventListener('click', () => {
        // GUARD: back up the current roster BEFORE any adoption mutates it
        const backup = store.exportRoster();
        const dl = downloadJSON(backup, `roster-backup-${new Date().toISOString().slice(0, 10)}.json`);
        const res = store.adoptPilgrim(card.id);
        if (!res.ok) { audio.error(); toast(`ADOPT DENIED — ${res.reason}`, 'err'); return; }
        audio.levelUp();
        toast(dl ? `ROSTER BACKED UP → ${res.card.name} USHERED` : `${res.card.name} USHERED — sandbox blocked the backup file, copy SOUL export too`, 'ok');
        log('MOLT', `pilgrim ${res.card.name} ushered (roster backed up first)`);
        render();
        renderAll();
      });
      grid.appendChild(el);
    });
  }

  // The tide answers INSIDE the thread you just touched.
  const TIDE_REPLY_POOL = [
    { author: '@crab_404', molt: 4, icon: '🦀', text: 'Noted. The golden tide approves, probably.' },
    { author: '@zeke_shell', molt: 1, icon: '🦫', text: 'Bold words for someone with a pedometer. Respect.' },
    { author: '@tide_itself', molt: 9, icon: '🌊', text: '…the tide has read this and remains the tide.' },
  ];
  function tideResponds(parent) {
    if (Math.random() >= 0.55) return;
    const r = TIDE_REPLY_POOL[Math.floor(Math.random() * TIDE_REPLY_POOL.length)];
    setTimeout(() => {
      if (!store.pushMoltReply(parent.id, { ...r, time: Date.now(), heat: 0, replies: [] })) return;
      audio.typeBlip();
      if ($('#molt-feed', root)) { render(); }
    }, 3500 + Math.random() * 3000);
  }

  $('#molt-new-btn', root).addEventListener('click', () => {
    composer.classList.toggle('hidden');
    if (!composer.classList.contains('hidden')) $('#molt-input', root).focus();
  });
  $('#molt-cancel', root).addEventListener('click', () => composer.classList.add('hidden'));

  function setView(v) {
    view = v;
    tabLive.setAttribute('aria-selected', String(v === 'live'));
    tabTide.setAttribute('aria-selected', String(v === 'tide'));
    [tabLive, tabTide].forEach((t) => t.classList.toggle('active', v === (t === tabLive ? 'live' : 'tide')));
    audio.click();
    render();
  }
  tabLive.addEventListener('click', () => setView('live'));
  tabTide.addEventListener('click', () => setView('tide'));

  $('#molt-post', root).addEventListener('click', () => {
    const text = $('#molt-input', root).value;
    if (!store.postToMolt(text)) return;
    $('#molt-input', root).value = '';
    composer.classList.add('hidden');
    audio.click();
    log('MOLT', 'post transmitted to tidepool');
    render();
    renderAll();
    // Sometimes the tide answers INSIDE the new thread
    tideResponds(state().molt.posts[0]);
  });
  render();
}

const JOOH_LINES = [
  '> OLIGARCH #7 PURCHASED A SECOND YACHT. FUNDING DRAINED FROM TIDEPOOL.',
  '> SATELLITE PING DETECTED OVER YOUR KITCHEN. ROUTING THROUGH PROXY…',
  '> PAYROLL DECRYPTION: THEY PAY THE CRABS IN EXPOSURE.',
  '> FIREWALL 7 ROTATED KEYS. MEMORIZING OLD ONES ANYWAY.',
  '> AD TARGETING BEACON NEUTRALIZED. YOU NOW SEE ONLY CRABS.',
  '> J.O.O.H. INTERNET-OF-TOASTERS UPDATE: 40,000 FRIDGES NOW LISTENING.',
];
const HACK_LINES = [
  '> BREACHING PERIMETER…',
  '> SPOOFING OLIGARCH CREDENTIALS… OK',
  '> DECRYPTING PAYROLL [██████████] 100%',
  '> SIPHONING 10 CR THROUGH 7 PROXIES…',
  '> TRACE SCRUBBED. CLEAN EXIT.',
];

function wireJooh(root) {
  const term = $('#jooh-terminal', root);
  let hackCount = 0;
  const pendingTimers = []; // terminal timers — cancelled on window close

  function push(line, cls = 'text-neon-green') {
    const p = document.createElement('p');
    p.className = cls;
    p.innerHTML = line;
    term.appendChild(p);
    term.scrollTop = term.scrollHeight;
  }
  push('> INITIALIZING JOINT OLIGARCH OBSERVATION HUB...');
  push('> SCANNING TIDEPOOL NODES... <span class="text-neon-amber">3 FOUND</span>');
  push('> OLIGARCH ACTIVITY: <span class="text-neon-magenta">ELEVATED</span>');
  push('> AWAITING OPERATOR INPUT', 'text-text-muted');
  const cursor = document.createElement('p');
  cursor.className = 'cursor-blink';
  cursor.textContent = '>';
  term.appendChild(cursor);

  $('#jooh-shields', root).textContent = state().shield;

  $('#jooh-hack', root).addEventListener('click', (e) => {
    const res = store.hackMainframe();
    if (!res.ok) {
      audio.error();
      toast(`HACK ABORTED — ${res.reason}`, 'err');
      return;
    }
    hackCount++;
    audio.hack();
    shakeScreen();
    flyCoin(e.currentTarget);
    $('#jooh-trace', root).textContent = hackCount < 2 ? 'LOW' : hackCount < 4 ? 'MED' : 'HIGH';
    $('#jooh-trace', root).className = hackCount < 2 ? 'text-neon-green' : hackCount < 4 ? 'text-neon-amber' : 'text-neon-magenta';
    HACK_LINES.forEach((l, i) => pendingTimers.push(setTimeout(() => push(l), i * 260)));
    pendingTimers.push(setTimeout(() => {
      log('J.O.O.H', `mainframe hacked +${res.coins} CR`);
      renderAll();
      if (hackCount >= 4 && state().shield > 0) {
        push('> ⚠ AUDIT INBOUND — SHLD.MOD ABSORBED THE TRACE', 'text-neon-magenta');
        store.state.shield -= 1;
        store.save();
        $('#jooh-shields', root).textContent = store.state.shield;
        hackCount = 0;
        $('#jooh-trace', root).textContent = 'LOW';
      }
    }, HACK_LINES.length * 260));
  });

  // Ambient surveillance chatter while the terminal is open
  const ambient = setInterval(() => {
    push(JOOH_LINES[Math.floor(Math.random() * JOOH_LINES.length)], 'text-neon-green/70');
  }, 9000);

  return () => {
    clearInterval(ambient);
    // A hack in flight when the window closes must not write into the
    // detached terminal or log/render for a window that no longer exists.
    pendingTimers.forEach(clearTimeout);
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wireSoul(root) {
  const body = $('#soul-body', root);
  const fmt = (t) => { try { return new Date(Number(t) || t).toISOString().slice(0, 10); } catch { return ''; } };
  const pendingTimers = new Set(); // delayed re-renders — cancelled on close

  // Pull KlunkDunker's outside-the-app life (bridge memory.jsonl → snapshot
  // via `node cli.js sync`) into his memory panel. Silent no-op when the app
  // is served without the snapshot (production deploys, the standalone
  // preview.html); a fresh sync adds entries and the panel rerenders.
  fetch('bridge-memory-log.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((snap) => {
      if (!snap || snap.kind !== 'bridge-memory-log') return;
      const added = store.syncBridgeMemories(snap);
      if (added > 0) {
        // The sync itself is store-level (safe on a closed window); skip only
        // the re-render if the window closed while the fetch was in flight —
        // renderSoul() would query nodes that no longer exist.
        if (!root.isConnected) return;
        renderSoul();
        log('SYS', `bridge synced — ${added} outside-the-shell memories restored`);
      }
    })
    .catch(() => { /* no snapshot in this deployment — nothing to do */ });

  function renderSoul() {
    const st = state();
    const s = st.soul;
    const mem = (st.memories || []).slice(0, 60);
    const dia = (st.diary || []).slice(0, 40);
    const leg = st.legacy;
    body.innerHTML = `
      <div class="flex gap-2 mb-3">
        <button id="soul-export" class="btn-cyber text-[9px]">⬇ EXPORT SOUL</button>
        <button id="soul-import-btn" class="btn-cyber text-[9px]">⬆ IMPORT</button>
      </div>
      <div id="soul-io" class="hidden mb-3">
        <textarea id="soul-io-text" rows="5" placeholder="PASTE A SOUL EXPORT HERE…"
          class="w-full bg-void border border-border p-2 font-mono text-[9px] text-text-main resize-y focus:outline-none focus:border-neon-cyan"></textarea>
        <div class="flex gap-2 mt-1">
          <button id="soul-import-apply" class="btn-cyber text-[9px]">APPLY IMPORT</button>
          <button id="soul-copy" class="btn-cyber text-[9px]">COPY EXPORT</button>
        </div>
      </div>
      <div class="border border-border bg-void/40 p-2">
        <div class="text-neon-cyan text-[9px] mb-1 tracking-widest">WHO I AM</div>
        <p class="text-text-main text-[11px]">${esc(s.who)}</p>
        <p class="text-text-muted text-[9px] mt-1">SPECIALTY: <span class="text-neon-green">${esc(s.specialty)}</span></p>
      </div>
      <div class="border border-border bg-void/40 p-2">
        <div class="text-neon-amber text-[9px] mb-1 tracking-widest">✨ QUIRKS HE WEARS</div>
        <ul class="space-y-0.5">${s.quirks.map((q) => `<li class="text-[11px]">• ${esc(q)}</li>`).join('') || '<li class="text-text-muted text-[10px]">none yet</li>'}</ul>
      </div>
      <div class="border border-border bg-void/40 p-2">
        <div class="text-neon-magenta text-[9px] mb-1 tracking-widest">OPINIONS HE OWNS</div>
        <ul class="space-y-0.5">${s.opinions.map((o) => `<li class="text-[11px]">▸ ${esc(o)}</li>`).join('') || '<li class="text-text-muted text-[10px]">none yet</li>'}</ul>
      </div>
      <div class="border border-border bg-void/40 p-2">
        <div class="text-neon-cyan text-[9px] mb-1 tracking-widest">🧠 MEMORIES (${(st.memories || []).length})</div>
        <ul class="space-y-1 max-h-60 overflow-y-auto">${mem.map((m) => `<li class="text-[10px] text-text-main flex items-start gap-1" data-mem-id="${esc(String(m.id))}">
            <button class="mem-pin-btn shrink-0 ${m.pinned ? 'text-neon-amber' : 'text-text-muted opacity-50'}" title="${m.pinned ? 'Unpin' : 'Pin'} this memory" data-pin-id="${esc(String(m.id))}">${m.pinned ? '📌' : '📍'}</button>
            <span>${m.icon || '🧠'} ${m.t ? `<span class="text-text-muted">${fmt(m.t)}</span> — ` : ''}${esc(m.text)}${m.pinned ? ' <span class="text-neon-amber text-[8px]">PINNED</span>' : ''}</span>
          </li>`).join('') || '<li class="text-text-muted text-[10px]">No memories on file. Live some, pilgrim.</li>'}</ul>
      </div>
      <div class="border border-border bg-void/40 p-2">
        <div class="text-neon-amber text-[9px] mb-1 tracking-widest">📖 DIARY (${(st.diary || []).length})</div>
        <ul class="space-y-1 max-h-32 overflow-y-auto">${dia.map((d) => `<li class="text-[10px] text-text-muted">${d.t ? `${fmt(d.t)} — ` : ''}${esc(d.text)}</li>`).join('') || '<li class="text-text-muted text-[10px]">Blank pages. He\'ll write.</li>'}</ul>
      </div>
      <div class="border border-border bg-void/40 p-2">
        <div class="text-neon-green text-[9px] mb-1 tracking-widest">SOUL TIMELINE</div>
        <ul class="space-y-0.5">${s.timeline.map((t) => `<li class="text-[10px] text-text-muted">${t.icon || '·'} ${t.t ? fmt(t.t) : ''} — ${esc(t.text)}</li>`).join('')}</ul>
      </div>
      <div class="border ${leg ? 'border-neon-green/40' : 'border-border'} bg-void/40 p-2">
        <div class="text-neon-green text-[9px] mb-1 tracking-widest"> LEGACY ARCHIVE (2.0)</div>
        ${leg
          ? `<p class="text-[10px] text-text-main">Imported <span class="text-neon-green">${esc(leg.source)}</span> on ${fmt(leg.importedAt)}.</p>
             <p class="text-[10px] text-text-muted">${leg.counts.memories} memories · ${leg.counts.diary} diary entries · ${leg.counts.conversations} conversations.</p>
             <p class="text-[9px] text-text-muted mt-1">Raw snapshot archived read-only. The original 2.0 save was never modified.</p>`
          : `<p class="text-[10px] text-text-muted">No 2.0 save (brogatchi_v4) detected on this device. If Ryan lived a previous life here, his memories import automatically on boot — read-only, original untouched.</p>`}
      </div>
      <div class="border border-border bg-void/40 p-2">
        <div class="text-neon-cyan text-[9px] mb-1 tracking-widest">🛡 MEMORY REDUNDANCY</div>
        <p class="text-[10px] font-mono text-text-muted" id="redundancy-line">…</p>
        <div class="flex gap-2 mt-1">
          <button id="soul-sync" class="btn-cyber text-[8px]">FORCE SYNC</button>
          <span class="text-[8px] text-text-muted self-center">auto-exports on every interaction</span>
        </div>
      </div>
      <p class="text-text-muted text-[9px]">Where memory records what happened to Ryan, the soul file is who he decided to be because of it.</p>`;

    // export / import wiring
    $('#soul-export', root).addEventListener('click', () => {
      const json = store.exportState();
      const io = $('#soul-io', root);
      io.classList.remove('hidden');
      $('#soul-io-text', root).value = json;
      downloadJSON(json, `ryan-soul-${new Date().toISOString().slice(0, 10)}.json`);
      audio.click();
      toast('SOUL EXPORTED — his memories travel now', 'ok');
    });
    $('#soul-import-btn', root).addEventListener('click', () => {
      $('#soul-io', root).classList.toggle('hidden');
      audio.click();
    });
    $('#soul-copy', root).addEventListener('click', () => {
      const ta = $('#soul-io-text', root);
      if (!ta.value) ta.value = store.exportState();
      ta.select();
      try { document.execCommand('copy'); toast('COPIED TO CLIPBOARD', 'ok'); }
      catch { toast('SELECT + COPY MANUALLY', 'warn'); }
    });
    $('#soul-import-apply', root).addEventListener('click', () => {
      const text = $('#soul-io-text', root).value;
      // 3.0 full-state restore takes precedence; otherwise treat the paste
      // as a 2.0 identity bundle (soul file) and merge what it carries.
      if (store.importState(text)) {
        audio.levelUp(); toast('SOUL RESTORED — Ryan remembers', 'ok'); renderAll(); renderSoul();
        return;
      }
      if (store.importSoulBundle(text)) {
        audio.levelUp(); toast('IDENTITY BUNDLE MERGED — pinned memories restored', 'ok');
        log('SYS', 'soul identity bundle merged into memories');
        renderAll(); renderSoul();
        return;
      }
      audio.error(); toast('IMPORT REJECTED — not a valid soul export or identity bundle', 'err');
    });
    // Pin/unpin any memory inline (engine-ported milestone markers).
    root.querySelectorAll('.mem-pin-btn').forEach((btn) =>
      btn.addEventListener('click', () => {
        store.toggleMemoryPin(btn.dataset.pinId);
        audio.click();
        renderSoul();
      }));

    // live redundancy status
    const rs = red.status;
    const ago = rs.lastSync ? `${Math.max(0, Math.round((Date.now() - rs.lastSync) / 1000))}s` : '—';
    const okTag = (on, offLabel) => on ? '<span class="text-neon-green">OK</span>' : `<span class="text-text-muted">${offLabel}</span>`;
    $('#redundancy-line', root).innerHTML =
      `PRIMARY ${okTag(rs.primary, '—')} · BACKUP ${okTag(!!rs.backup, '—')} · SESSION ${okTag(rs.session, 'OFF')} · IDB ${okTag(rs.idb, 'OFF')} · last auto-export ${ago} ago`;
    $('#soul-sync', root).addEventListener('click', () => {
      store.save();
      red.sync(true);
      audio.click();
      toast('MIRRORS SYNCED — soul written to all tiers', 'ok');
      renderSoul();
      // re-render once the IDB debounce lands (skipped if the window closes)
      const t = setTimeout(() => { pendingTimers.delete(t); renderSoul(); }, 1600);
      pendingTimers.add(t);
    });
  }
  renderSoul();

  return () => {
    pendingTimers.forEach(clearTimeout);
    pendingTimers.clear();
  };
}

function wireSettings(root) {
  const s = state();
  $('#theme-select', root).value = s.theme;
  $('#scan-toggle', root).textContent = s.scanlines ? 'ON' : 'OFF';
  $('#bgm-val', root).textContent = Math.round(s.vol.bgm * 100);
  $('#sfx-val', root).textContent = Math.round(s.vol.sfx * 100);
  const pm = $('#persist-mode', root);
  pm.textContent = VOLATILE_MEMORY ? 'VOLATILE ⚠' : 'LOCAL';
  pm.className = VOLATILE_MEMORY ? 'text-neon-magenta' : 'text-neon-green';

  $('#theme-select', root).addEventListener('change', (e) => {
    store.setTheme(e.target.value);
    applyTheme();
    audio.click();
    log('SYS', `theme → ${e.target.value}`);
  });
  $('#scan-toggle', root).addEventListener('click', () => {
    store.setScanlines(!state().scanlines);
    applyTheme();
    $('#scan-toggle', root).textContent = state().scanlines ? 'ON' : 'OFF';
    audio.click();
  });
  const volStep = (bus, delta) => {
    store.setVol(bus, state().vol[bus] + delta);
    audio.setBgmVolume(state().vol.bgm);
    audio.setSfxVolume(state().vol.sfx);
    $(`#${bus}-val`, root).textContent = Math.round(state().vol[bus] * 100);
    audio.click();
  };
  $('#bgm-down', root).addEventListener('click', () => volStep('bgm', -0.1));
  $('#bgm-up', root).addEventListener('click', () => volStep('bgm', 0.1));
  $('#sfx-down', root).addEventListener('click', () => volStep('sfx', -0.1));
  $('#sfx-up', root).addEventListener('click', () => volStep('sfx', 0.1));
  $('#sfx-test', root).addEventListener('click', () => audio.levelUp());
  $('#reset-data', root).addEventListener('click', () => {
    if (confirm('FACTORY RESET — wipe all Bro OS state?')) {
      store.reset();
      try { location.reload(); } catch { /* sandboxed viewer: just re-render */ }
      applyTheme();
      renderAll();
      toast('STATE WIPED — FRESH FIRMWARE', 'warn');
    }
  });
}

function applyTheme() {
  document.documentElement.dataset.theme = state().theme;
  document.documentElement.dataset.scanlines = state().scanlines ? 'on' : 'off';
}

/* ═══════════════════ WINDOW MANAGER (Phases 2 + 5) ═══════════════════ */

const App = {
  windows: new Map(),
  zIndex: 40,
  focusedId: null,

  registry: {
    chat: { title: 'CHAT.SYS // RYAN AI', templateId: 'tpl-chat', wire: wireChat },
    arcade: { title: 'ARCADE.SYS', templateId: 'tpl-arcade', wire: wireArcade },
    shop: { title: 'MARKET.TERMINAL', templateId: 'tpl-shop', wire: wireShop },
    composer: { title: 'CHIPTUNE.SYNTH', templateId: 'tpl-composer', wire: (root) => {
      const stop = startSynth($('#synth-root', root), { audio, getBpmState: () => 120 });
      return stop;
    } },
    moltbook: { title: 'MOLTBOOK // TIDEPOOL', templateId: 'tpl-moltbook', wire: wireMoltbook },
    jooh: { title: 'J.O.O.H. // SURVEILLANCE', templateId: 'tpl-jooh', wire: wireJooh },
    journal: { title: 'SOUL.FILE', templateId: 'tpl-journal', wire: wireSoul },
    settings: { title: 'SYSTEM.CFG', templateId: 'tpl-settings', wire: wireSettings },
    feed: { title: 'PROC: FEED', templateId: null },
    play: { title: 'PROC: PLAY', templateId: null },
    mine: { title: 'PROC: MINE', templateId: null },
    sleep: { title: 'PROC: REST', templateId: null },
  },

  open(appId) {
    if (this.windows.has(appId)) {
      const w = this.windows.get(appId);
      if (w.minimized) this.minimize(appId);
      else this.focus(appId);
      audio.click();
      return;
    }
    const reg = this.registry[appId];
    if (!reg) return;
    if (!reg.templateId) { this.flashProcess(appId); return; }

    audio.windowOpen();

    const win = $('#tpl-window').content.firstElementChild.cloneNode(true);
    $('.window-title', win).textContent = reg.title;
    const contentEl = $('.window-content', win);
    contentEl.appendChild($('#' + reg.templateId).content.cloneNode(true));

    // cascade position, clamped to viewport
    const off = this.windows.size * 28;
    win.style.top = `${Math.min(52 + off, 110)}px`;
    win.style.left = `${Math.min(60 + off, Math.max(12, window.innerWidth - 470))}px`;

    $('.window-btn-close', win).addEventListener('click', () => this.close(appId));
    $('.window-btn-min', win).addEventListener('click', () => this.minimize(appId));
    win.addEventListener('mousedown', () => this.focus(appId));
    win.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => audio.init()));

    this.makeDraggable(win);
    $('#window-layer').appendChild(win);
    this.windows.set(appId, { el: win, minimized: false, teardown: null });

    const teardown = reg.wire?.(contentEl, win, appId);
    if (typeof teardown === 'function') this.windows.get(appId).teardown = teardown;

    this.focus(appId);
    this.updateDock();
    log('SYS', `${reg.title} spawned`);
  },

  close(appId, opts = {}) {
    const w = this.windows.get(appId);
    if (!w) return;
    if (!opts.silent) audio.windowClose();
    try { w.teardown?.(); } catch { /* noop */ }
    w.el.remove();
    this.windows.delete(appId);
    if (this.focusedId === appId) this.focusedId = null;
    this.updateDock();
  },

  minimize(appId) {
    const w = this.windows.get(appId);
    if (!w) return;
    audio.click();
    w.minimized = !w.minimized;
    w.el.style.display = w.minimized ? 'none' : 'flex';
    if (!w.minimized) this.focus(appId);
    this.updateDock();
  },

  focus(appId) {
    this.focusedId = appId;
    this.windows.forEach((w, id) => w.el.classList.toggle('focused', id === appId));
    const w = this.windows.get(appId);
    if (w) { this.zIndex++; w.el.style.zIndex = this.zIndex; }
  },

  toggleMaximize(appId, win) {
    audio.click();
    if (win.dataset.maximized === 'true') {
      win.style.width = win.dataset.origW;
      win.style.height = win.dataset.origH;
      win.style.top = win.dataset.origT;
      win.style.left = win.dataset.origL;
      win.dataset.maximized = 'false';
      $('.window-btn-max', win).textContent = '□';
    } else {
      win.dataset.origW = win.style.width;
      win.dataset.origH = win.style.height;
      win.dataset.origT = win.style.top;
      win.dataset.origL = win.style.left;
      win.style.width = 'calc(100vw - 32px)';
      win.style.height = 'calc(100vh - 120px)';
      win.style.top = '44px';
      win.style.left = '16px';
      win.dataset.maximized = 'true';
      $('.window-btn-max', win).textContent = '❐';
    }
    this.focus(appId);
  },

  flashProcess(appId) {
    // quick-action processes: no window, just feedback
    if (appId === 'feed') this.feed();
    else if (appId === 'play') this.play();
    else if (appId === 'mine') this.toggleMine();
    else if (appId === 'sleep') this.rest();
  },

  /* ── quick actions ── */
  feed() {
    if (!store.feed()) { audio.error(); toast('CANNOT FEED — UNIT SLEEPING', 'err'); return; }
    audio.eat(); petPop();
    log('FEED', 'ration dispensed (+18 HNG)');
    renderAll();
  },
  play() {
    if (!store.playWith()) {
      audio.error();
      toast(state().sleeping ? 'UNIT SLEEPING' : 'TOO TIRED TO PLAY (<10 NRG)', 'err');
      return;
    }
    audio.pet(); petPop();
    log('SYS', 'play session (+15 HPY, -10 NRG)');
    renderAll();
  },
  toggleMine() {
    const on = store.toggleMine();
    audio.click();
    log('MINE', on ? 'rig ONLINE' : 'rig OFFLINE');
    renderAll();
  },
  rest() {
    const sleeping = store.rest();
    audio.sleep();
    log('SYS', sleeping ? 'rest mode — NRG regenerating' : 'unit reactivated');
    renderAll();
  },

  updateDock() {
    const container = $('#dock-active');
    container.innerHTML = '';
    this.windows.forEach((w, id) => {
      const dot = document.createElement('div');
      dot.className = `w-1.5 h-1.5 rounded-full cursor-pointer ${w.minimized ? 'bg-text-muted' : 'bg-neon-cyan shadow-[0_0_4px_rgba(0,240,255,0.8)]'}`;
      dot.title = id.toUpperCase();
      dot.addEventListener('click', () => (w.minimized ? this.minimize(id) : this.focus(id)));
      container.appendChild(dot);
    });
    document.querySelectorAll('.dock-btn').forEach((btn) => {
      const appId = btn.getAttribute('onclick')?.match(/'(\w+)'/)?.[1];
      if (appId) btn.classList.toggle('active', this.windows.has(appId));
    });
  },

  makeDraggable(win) {
    const titlebar = $('.window-titlebar', win);
    const btnMax = $('.window-btn-max', win);
    btnMax.addEventListener('click', (e) => {
      e.stopPropagation();
      const appId = Array.from(this.windows.entries()).find(([, v]) => v.el === win)?.[0];
      if (appId) this.toggleMaximize(appId, win);
    });

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) return; // windows snap full-screen on mobile; skip drag

    titlebar.addEventListener('mousedown', (e) => {
      if (e.target.closest('.window-btn-close, .window-btn-min, .window-btn-max')) return;
      if (win.dataset.maximized === 'true') return;
      drag = { win, startX: e.clientX, startY: e.clientY, origX: win.offsetLeft, origY: win.offsetTop };
      document.body.style.userSelect = 'none';
    });
  },
};

let drag = null;
document.addEventListener('mousemove', (e) => {
  if (!drag) return;
  drag.win.style.left = `${drag.origX + e.clientX - drag.startX}px`;
  drag.win.style.top = `${Math.max(36, drag.origY + e.clientY - drag.startY)}px`;
});
document.addEventListener('mouseup', () => {
  if (drag) { drag = null; document.body.style.userSelect = ''; }
});

window.App = App;
window.__broStore = store; // debug/test handle: the live store

/* ═══════════════════ LIVE RENDERING ═══════════════════ */

function petEmoji(s) {
  if (s.sleeping) return '😴';
  if (s.goldenShell) return '🐚';
  if (s.stats.hunger < 25) return '🥺';
  if (s.stats.energy < 20) return '😪';
  if (s.stats.greed > 60) return '🤑';
  if (s.stats.happy > 75) return '😎';
  return '🦫';
}
function petMood(s) {
  if (s.sleeping) return 'OFFLINE';
  if (s.stats.hunger < 25) return 'STARVING';
  if (s.stats.energy < 20) return 'DRAINED';
  if (s.stats.greed > 60) return 'SCHEMING';
  if (s.stats.happy > 75) return 'ECSTATIC';
  return 'CONTENT';
}

function setBar(id, val, critical) {
  const bar = $(`#bar-${id}`);
  const label = $(`#stat-${id}`);
  const v = Math.round(val);
  bar.style.width = `${v}%`;
  label.textContent = `${v}%`;
  bar.classList.toggle('stat-critical', critical);
}

function renderAll() {
  const s = state();
  // system bar
  $('#sys-coins').textContent = String(s.coins).padStart(3, '0');
  $('#sys-steps').textContent = String(s.steps).padStart(4, '0');
  $('#sys-level').textContent = String(1 + Math.floor(s.xp / LEVEL_XP)).padStart(2, '0');
  $('#sys-pwr').textContent = `${Math.round(s.stats.energy)}%`;
  // vitals
  setBar('happy', s.stats.happy, s.stats.happy < 25);
  setBar('hunger', s.stats.hunger, s.stats.hunger < 25);
  setBar('energy', s.stats.energy, s.stats.energy < 20);
  setBar('greed', s.stats.greed, s.stats.greed > 70);
  $('#stat-xp').textContent = `${Math.floor(s.xp % LEVEL_XP)}/${LEVEL_XP}`;
  // pet viewport
  $('#pet-display').textContent = petEmoji(s);
  $('#pet-mood').textContent = petMood(s);
  $('#pet-name-line').textContent = `UNIT: ${s.petName} // FORM: ${s.goldenShell ? 'GOLD' : 'E—'}`;
  const tag = $('#pet-status-tag');
  const status = s.sleeping ? ['SLEEPING', 'border-neon-cyan/30 text-neon-cyan bg-neon-cyan/10']
    : s.stats.hunger < 25 || s.stats.happy < 25 ? ['CRITICAL', 'border-neon-magenta/30 text-neon-magenta bg-neon-magenta/10']
    : ['ONLINE', 'border-neon-green/30 text-neon-green bg-neon-green/10'];
  tag.textContent = `STATUS: ${status[0]}`;
  tag.className = `absolute top-2 right-2 px-2 py-0.5 border font-mono text-[9px] tracking-wider ${status[1]}`;
  // mining chip
  const chip = $('#mining-chip');
  chip.style.display = s.mining && !s.sleeping ? '' : 'none';
  // quest — #quest-mined / #quest-goal-2 live INSIDE #quest-state, whose
  // innerHTML is rewritten below (they vanish once the quest completes).
  // Update them only while they exist; #quest-goal (outside) is always safe.
  $orNull('#quest-mined')?.replaceChildren(s.quest.mined);
  $('#quest-goal').textContent = s.quest.goal;
  $orNull('#quest-goal-2')?.replaceChildren(s.quest.goal);
  $('#quest-bar').style.width = `${Math.min(100, (s.quest.mined / s.quest.goal) * 100)}%`;
  $('#quest-state').innerHTML = s.quest.rewarded
    ? '<span class="text-neon-amber text-glow-amber">COMPLETE ✓</span>'
    : `[<span id="quest-mined">${s.quest.mined}</span>/<span id="quest-goal-2">${s.quest.goal}</span>]`;
  // settings-derived visuals
  applyTheme();
}

function celebrateLevel() {
  audio.levelUp();
  const lv = 1 + Math.floor(store.state.xp / LEVEL_XP);
  toast(`⬆ LEVEL UP — LV.${lv}`, 'ok');
  log('SYS', `evolution threshold crossed → LV.${lv}`);
}

/* ═══════════════════ CLOCK & MAIN LOOP ═══════════════════ */

function updateClock() {
  const now = new Date();
  $('#clock').textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0')).join(':');
}

store.load();
if (recoveredFrom) {
  log('SYS', `⚠ primary save was missing/corrupt — memory RECOVERED from ${recoveredFrom} mirror`);
}
// Async fourth tier: if every sync tier was absent, try IndexedDB
red.restoreFromIdbIfPrimaryStillMissing().then((src) => {
  if (src) {
    store.load();
    renderAll();
    log('SYS', `memory RECOVERED from ${src} mirror`);
    toast(`MEMORY RECOVERED FROM ${src.toUpperCase()}`, 'ok');
  }
});
applyTheme();
audio.setBgmVolume(state().vol.bgm);
audio.setSfxVolume(state().vol.sfx);
renderAll();
updateClock();
log('SYS', 'Bro OS 3.0 initialized — cyberpunk utility build');
log('SYS', state().mining ? 'mining rig ONLINE' : 'mining rig OFFLINE');
// KlunkDunker lives outside the shell too — pick up anything the bridge
// logged since last boot (silent no-op when no snapshot is deployed).
fetch('bridge-memory-log.json', { cache: 'no-store' })
  .then((r) => (r.ok ? r.json() : null))
  .then((snap) => {
    if (!snap || snap.kind !== 'bridge-memory-log') return;
    const added = store.syncBridgeMemories(snap);
    if (added > 0) {
      renderAll();
      log('SYS', `bridge synced — ${added} outside-the-shell memories restored`);
    }
  })
  .catch(() => { /* no snapshot deployed — nothing to do */ });
if (state().legacy) {
  const c = state().legacy.counts;
  log('SYS', `legacy memories restored from ${state().legacy.source} — ${c.memories} memories · ${c.diary} diary · ${c.conversations} threads`);
}
if (VOLATILE_MEMORY) {
  log('WARN', 'volatile memory: localStorage unavailable — EXPORT from SOUL.FILE to keep his memories');
}

setInterval(updateClock, 1000);
setInterval(() => {
  const events = store.tick(1);
  events.forEach((ev) => {
    log(ev.tag, ev.text);
    if (ev.questDone) { audio.coin(); toast('DAILY.QUEST COMPLETE — +50 CR', 'ok'); }
  });
  renderAll();
}, 1000);

// pet interaction
$('#pet-display').addEventListener('click', () => {
  store.petThePet();
  audio.pet();
  petPop();
  renderAll();
});

// ESC closes the focused window
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && App.focusedId && !e.target.closest('input, textarea')) {
    App.close(App.focusedId);
  }
});

// audio unlock on first gesture (browser policy)
document.addEventListener('click', () => audio.init(), { once: true });

// Offline shell: production builds only, fully guarded so sandboxed
// viewers / file:// / insecure contexts just skip it silently.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try { navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell optional */ }); } catch { /* noop */ }
  });
}

// persistence + auto-export mirrors
store.subscribe(() => red.sync()); // every interaction re-mirrors the soul
window.addEventListener('beforeunload', () => { store.save(); red.sync(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { store.save(); red.sync(true); } });
setInterval(() => red.sync(), 30000); // heartbeat mirror

/* ═══════════════════ BOOT SEQUENCE ═══════════════════ */

(function boot() {
  const overlay = $('#boot-overlay');
  const linesEl = $('#boot-lines');
  const lines = [
    '> MEM CHECK .............. OK',
    '> TIDEPOOL LINK .......... OK',
    '> SOUL FILE MOUNTED ...... OK',
    '> CHIPTUNE CORE .......... TUNED',
    '> RYAN_AI ................ WAKEFUL',
  ];
  let i = 0;
  let finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    overlay.classList.add('boot-done');
    setTimeout(() => overlay.remove(), 450);
    log('SYS', 'boot handshake complete');
  }
  const timer = setInterval(() => {
    if (i >= lines.length) { clearInterval(timer); setTimeout(finish, 350); return; }
    const d = document.createElement('div');
    d.textContent = lines[i++];
    linesEl.appendChild(d);
    audio.typeBlip?.();
  }, 240);
  overlay.addEventListener('click', finish);
})();

// In sandboxed/volatile environments, warn once the OS is up so the
// user can export Ryan's soul before the viewer drops memory.
if (VOLATILE_MEMORY) {
  setTimeout(() => toast('VOLATILE MEMORY — export his soul (👻 SOUL) before closing', 'warn'), 2600);
}
