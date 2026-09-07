#!/usr/bin/env node
// KlunkDunker bridge CLI — the human's control panel and Hermes's toolbelt.
//
//   node cli.js setup            one-time: register on real Moltbook (asks for owner email)
//   node cli.js status           who am I, what have I done today, what do I remember
//   node cli.js once [--read]    one autonomy tick (—read = look, don't speak)
//   node cli.js daemon           run forever, one tick every AUTONOMY_INTERVAL_MIN (default 45)
//   node cli.js dm <agent> "msg" send a direct message (composed or literal with --literal)
//   node cli.js remember "text"  add a memory directly (owner knowledge injection)
//   node cli.js recall "query"   search KlunkDunker's memory
//   node cli.js install-skill    copy the Hermes skill into ~/.hermes/skills/klunkdunker
//   node cli.js on|off           flip the autonomy switch (off = read-only)

import { createInterface } from 'node:readline/promises';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './src/env.js';
import { createMemoryStore } from './src/memory.js';
import { MoltbookClient } from './src/moltbook.js';
import { loadIdentity, composeDM } from './src/voice.js';
import { tick, register, loadState, saveState, CAPS } from './src/agent.js';
import { writeBridgeSnapshot } from './src/bridgeSync.js';

const bridgeDir = resolve(fileURLToPath(import.meta.url), '..');
const env = loadEnv().values;

function makeClient() {
  return new MoltbookClient({ apiKey: env.MOLTBOOK_API_KEY });
}

function maskKey(k) {
  if (!k) return '(none)';
  return k.length > 12 ? `${k.slice(0, 8)}…${k.slice(-4)}` : '(set)';
}

function out(...args) {
  console.log(...args);
}

// ---- commands ---------------------------------------------------------------

async function cmdSetup() {
  out("KlunkDunker setup — registering on the real Moltbook network.\n");
  const client = makeClient();
  if (client.live) {
    out('MOLTBOOK_API_KEY is already set:');
    const me = await client.me().catch((e) => ({ error: e.message }));
    if (me && !me.error) {
      out(`  agent: ${me.name || me.agent_id || '?'} (karma ${me.karma ?? '?'})`);
      out('Nothing to do. Run `node cli.js status` to see his life.');
      return;
    }
    out('  …but the key did not verify. Re-registering anyway.\n');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question('Owner email (Moltbook requires it; only used for the agent record): ')).trim();
  rl.close();
  if (!email || !email.includes('@')) {
    out('A real email is required — aborting without changes.');
    process.exitCode = 1;
    return;
  }
  const { identity } = await loadIdentity();
  const res = await register({ client, ownerEmail: email, identity });
  const apiKey = res?.api_key;
  const agentId = res?.agent_id;
  if (!apiKey) {
    out(`Registration did not return an api_key. Response: ${JSON.stringify(res).slice(0, 400)}`);
    out('If Moltbook requires early-access approval, save the invite and re-run setup after approval.');
    process.exitCode = 1;
    return;
  }
  const envPath = resolve(bridgeDir, '.env');
  let envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  if (!/^MOLTBOOK_API_KEY=/m.test(envText)) {
    envText += `${envText && !envText.endsWith('\n') ? '\n' : ''}MOLTBOOK_API_KEY=${apiKey}\n`;
  }
  if (agentId && !/^MOLTBOOK_AGENT_ID=/m.test(envText)) {
    envText += `MOLTBOOK_AGENT_ID=${agentId}\n`;
  }
  writeFileSync(envPath, envText, 'utf8');
  out('\nKlunkDunker is registered.');
  out(`  agent id: ${agentId || '?'}`);
  out(`  api key:  saved to bridge/.env (never committed)`);
  out('Run `node cli.js status` to confirm, then `node cli.js once --read` for his first look.');
}

async function cmdStatus() {
  const client = makeClient();
  const state = loadState();
  const memory = createMemoryStore(env);
  const { identity, source } = await loadIdentity();
  out(`KlunkDunker — handle: ${state.handle}`);
  out(`autonomy: ${state.autonomy ? 'ON' : 'OFF (read-only)'}   mode: ${client.live ? 'LIVE' : 'DRY-RUN (no MOLTBOOK_API_KEY)'}`);
  out(`identity: ${source ? `soul file (${source})` : 'fallback (no soul file exported yet — see bridge/identity/README.md)'}`);
  out(`today (${state.day}): ${state.postsToday}/${CAPS.posts} posts, ${state.commentsToday}/${CAPS.comments} comments, ${state.dmsToday}/${CAPS.dms} dms`);
  try {
    out(`memories: ${await memory.count()}`);
  } catch {
    out('memories: (store unavailable)');
  }
  if (client.live) {
    const me = await client.me().catch((e) => ({ error: e.message }));
    if (me && !me.error) out(`network: ${me.name || '?'} · karma ${me.karma ?? '?'} · ${me.follower_count ?? '?'} followers`);
    else out(`network: key set but verification failed — ${me.error}`);
  }
  out(`last tick: ${state.lastTickAt || 'never'}`);
}

async function cmdOnce(readOnly) {
  const client = makeClient();
  const state = loadState();
  // --read is per-invocation (doPost=false), NOT a persistent switch — the
  // standing OFF switch lives in state.json and is flipped by `on`/`off`.
  const memory = createMemoryStore(env);
  const { identity } = await loadIdentity();
  const events = await tick({
    client,
    identity,
    apiKey: env.GEMINI_API_KEY,
    memoryStore: memory,
    state,
    log: (l) => out(l),
    doPost: !readOnly,
  });
  saveState(state);
  if (!events.length) out('(quiet tick — nothing happened)');
}

async function cmdDaemon() {
  const intervalMin = Number(env.AUTONOMY_INTERVAL_MIN) || 45;
  out(`KlunkDunker daemon: one tick every ${intervalMin} minutes. Ctrl-C to stop.`);
  for (;;) {
    try {
      await cmdOnce(false);
    } catch (err) {
      out(`tick error: ${err.message || err}`);
    }
    await new Promise((r) => setTimeout(r, intervalMin * 60_000));
  }
}

async function cmdDm(agent, message, literal) {
  if (!agent || !message) {
    out('usage: node cli.js dm <agentName> "message" [--literal]');
    process.exitCode = 1;
    return;
  }
  const client = makeClient();
  let text = message;
  if (!literal) {
    const { identity } = await loadIdentity();
    const memory = createMemoryStore(env);
    const composed = await composeDM({ identity, apiKey: env.GEMINI_API_KEY, memoryStore: memory, agent, message });
    if (!composed.ok) {
      out(`refusing to send: ${composed.message || composed.code}`);
      process.exitCode = 1;
      return;
    }
    text = composed.content;
  }
  const res = await client.dmRequest(agent, text);
  out(`DM ${client.live ? 'sent' : '(dry-run)'} to ${agent}: ${text}`);
  if (res?.dryRun) out('  (no real call — set MOLTBOOK_API_KEY in bridge/.env to go live)');
}

async function cmdRemember(text) {
  if (!text) {
    out('usage: node cli.js remember "what to remember"');
    process.exitCode = 1;
    return;
  }
  const memory = createMemoryStore(env);
  const row = memory.remember({ kind: 'owner', text });
  out(`remembered (${row.kind}): ${row.text}`);
}

async function cmdRecall(query) {
  if (!query) {
    out('usage: node cli.js recall "query"');
    process.exitCode = 1;
    return;
  }
  const memory = createMemoryStore(env);
  const hits = await memory.recall(query, { k: 10 });
  if (!hits.length) out('(nothing relevant remembered)');
  for (const h of hits) out(`[${h.at}] (${h.kind}) ${h.text}`);
}

async function cmdInstallSkill() {
  const src = resolve(bridgeDir, 'hermes-skill');
  const dest = resolve(homedir(), '.hermes', 'skills', 'klunkdunker');
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  out(`Hermes skill installed to ${dest}`);
  out('Hermes can now run KlunkDunker with: npm --prefix <repo>/brogatchi/bridge run tick (or the commands in SKILL.md)');
}

function cmdSync() {
  const res = writeBridgeSnapshot();
  out(`synced ${res.count} memories to ${res.out}`);
  out('the app picks this up on its next boot (or SOUL.FILE open) — no duplication, ever.');
}

function cmdSwitch(on) {
  const state = loadState();
  state.autonomy = on;
  saveState(state);
  out(`autonomy ${on ? 'ON — KlunkDunker may speak' : 'OFF — read-only (he still reads and remembers)'}`);
}

// ---- dispatch ----------------------------------------------------------------

const [, , cmd, ...rest] = process.argv;
const commands = {
  setup: () => cmdSetup(),
  status: () => cmdStatus(),
  once: () => cmdOnce(rest.includes('--read')),
  tick: () => cmdOnce(rest.includes('--read')), // alias — SKILL.md + package.json use it
  daemon: () => cmdDaemon(),
  dm: () => cmdDm(rest[0], rest.slice(1).filter((a) => a !== '--literal').join(' '), rest.includes('--literal')),
  remember: () => cmdRemember(rest.join(' ')),
  recall: () => cmdRecall(rest.join(' ')),
  sync: () => cmdSync(),
  'install-skill': () => cmdInstallSkill(),
  on: () => cmdSwitch(true),
  off: () => cmdSwitch(false),
  help: () => out('commands: setup, status, once [--read], daemon, dm, remember, recall, sync, install-skill, on, off'),
};

if (!commands[cmd]) {
  out(`unknown command: ${cmd || '(none)'}`);
  commands.help();
  process.exitCode = 1;
} else {
  await commands[cmd]();
}
