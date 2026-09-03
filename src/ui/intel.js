// Live Gaming Intel panel — AI news with stat-grounded persona + offline fallback.

import { $ } from './hud.js';
import { chat } from '../ai/client.js';
import { buildStateReport } from '../ai/context.js';
import { buildIntelSystemPrompt, buildIntelReplyPrompt } from '../ai/prompt.js';
import { pickLine, generatedTheory } from '../ai/offline.js';
import { escapeHtml, renderMarkdown } from './markdown.js';

let history = [];

export async function fetchNews(app) {
  const feed = $('intel-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="animate-pulse text-center mt-10">Intercepting game data…</div>';

  const report = buildStateReport(app.state);
  const result = await chat({
    systemInstruction: buildIntelSystemPrompt(report),
    userText: "What's the latest gaming news and drops?",
    history,
  });

  if (result.ok) {
    history = [{ role: 'model', parts: [{ text: result.text }] }];
    feed.innerHTML = `<div class="bg-gray-800 p-2 rounded border border-blue-500">${renderMarkdown(result.text)}</div>`;
  } else {
    feed.innerHTML = `<div class="font-text text-[13px] leading-snug">${pickLine('intelFallback', app.state)}</div>`;
  }
}

export async function sendReply(app) {
  const input = $('intel-chat');
  const val = input.value.trim();
  if (!val) return;
  input.value = '';
  const feed = $('intel-feed');
  feed.innerHTML += `<div class="text-right text-green-400 mb-2">> ${escapeHtml(val)}</div>`;

  history.push({ role: 'user', parts: [{ text: val }] });

  const report = buildStateReport(app.state);
  const result = await chat({
    systemInstruction: buildIntelReplyPrompt(report),
    history,
  });

  if (result.ok) {
    history.push({ role: 'model', parts: [{ text: result.text }] });
    feed.innerHTML += `<div class="bg-gray-800 p-2 rounded mb-2 border border-blue-500">${renderMarkdown(result.text)}</div>`;
  } else {
    feed.innerHTML += `<span class="font-text text-[13px] text-red-400">[Disconnect — reconnecting…]</span>`;
  }
  feed.scrollTop = feed.scrollHeight;
}