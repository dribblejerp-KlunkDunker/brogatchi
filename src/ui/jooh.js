// J.O.O.H. Tracker — satirical billionaire surveillance feed. Local generator
// by default; the app can upgrade it with an AI banter line when a key exists.

import { $ } from './hud.js';
import { ask } from '../ai/gateway.js';
import { buildStateReport } from '../ai/context.js';
import { buildRyanSystemPrompt } from '../ai/prompt.js';
import { renderMarkdown } from './markdown.js';

const CEOS_LIST = [
  'Zucker-borg 9000 (Meta)', 'Elon Martian (X/Space)', 'Jeff Space-zos (Amazon)',
  'Bill Micro-Gates (Tech)', 'Tim Apple-Clone (Apple)', 'Sundar Skynet (Google)',
  'Warren Buffet-Bot (Berkshire)', 'Sam AI-tman (OpenAI)',
];
const ACTIONS = [
  'Boarding sub-orbital laser platform...',
  'Shedding reptile skin in bunker...',
  'Downloading patch 4.2 to frontal lobe...',
  'Summoning the Illuminati council...',
  'Buying a new private continent...',
  'Entering cryo-sleep chamber...',
  'Manipulating the simulation code...',
  'Meeting with the Gray Aliens...',
];
const LOCATIONS = [
  'Hollow Earth Base', 'Mars Colony Alpha', 'Deep Sea Server Farm',
  'Orbiting Station', 'Antarctica Pyramid', 'Area 51 VIP Lounge',
];

export function refreshJoohFeed(state) {
  const feed = $('jooh-feed');
  if (!feed) return;
  const shuffled = [...CEOS_LIST].sort(() => 0.5 - Math.random()).slice(0, 4);
  feed.innerHTML = shuffled
    .map((ceo) => {
      const act = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
      const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
      return `
        <div class="mb-3 border-b border-green-800 pb-2">
          <div class="font-bold text-green-300 drop-shadow">🎯 [${ceo}]</div>
          <div class="text-green-400">> STATUS: ${act}</div>
          <div class="text-green-500">> LOC: ${loc}</div>
        </div>`;
    })
    .join('');
}


// Optional AI flavor: when a key exists, hitch one rogue transmission onto the feed.
export async function appendAIIntercept(state, containerSelector) {
  const report = buildStateReport(state);
  const result = await ask({
    systemInstruction: buildRyanSystemPrompt(report),
    userText: 'Drop one rogue one-liner about what the oligarchs are doing RIGHT NOW, in your voice, 1 sentence.',
    kind: 'jooh',
    state,
  });
  if (result.ok) {
    const feed = $(containerSelector);
    if (feed) {
      feed.innerHTML += `
        <div class="mt-3 p-2 border border-purple-600 bg-purple-900/30">
          <div class="font-bold text-purple-300">🛰️ ROGUE SIGNAL</div>
          <div class="text-purple-200">${renderMarkdown(result.text)}</div>
        </div>`;
    }
  }
  return result.ok;
}