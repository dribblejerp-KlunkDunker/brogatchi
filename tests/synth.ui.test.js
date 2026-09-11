// CHIPTUNE.SYNTH remix lab — UI test through the REAL shell.
//
// Boots index.html + main.js in jsdom, opens the composer exactly as the dock
// does, and drives the editor: load a cabinet's loop, switch lanes and tiers,
// edit notes live, SAVE the remix — then prove the arcade's sequencer voices
// the remix's notes (through the real audio engine) instead of the stock loop.
// The bar is the codebase's usual one: zero console errors or warnings.
//
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRACKSETS } from '../src/gameMusic.js';

const SHELL_HTML = readFileSync('index.html', 'utf8');
const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

const CONSOLE_CALLS = [];
let realConsole;
let App;

const problems = () => CONSOLE_CALLS.filter((c) => c.method === 'error' || c.method === 'warn');

beforeEach(() => {
  realConsole = { error: console.error, warn: console.warn };
  for (const method of Object.keys(realConsole)) {
    console[method] = (...args) => {
      CONSOLE_CALLS.push({ method, text: args.map((a) => String(a)).join(' ') });
      realConsole[method](...args);
    };
  }
  CONSOLE_CALLS.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  for (const method of Object.keys(realConsole)) console[method] = realConsole[method];
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.__broBootOverlay?.stop?.();
  window.App = undefined;
  vi.resetModules();
});

async function boot() {
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
}

const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));
const change = (el) => el.dispatchEvent(new window.Event('change', { bubbles: true }));
const synthRoot = () => App.windows.get('composer').el.querySelector('#synth-root');
const bench = () => synthRoot().__synth.state();

describe('CHIPTUNE.SYNTH remix lab (real shell)', () => {
  it('loads every cabinet loop and lets the player edit it live', { timeout: 20000 }, async () => {
    await boot();
    App.open('composer');
    const root = synthRoot();

    // the bench offers every cabinet's track, and the tier selector mirrors
    // that cabinet's real track set
    const games = root.querySelector('#synth-track');
    const tiers = root.querySelector('#synth-tier');
    expect(games.options).toHaveLength(Object.keys(TRACKSETS).length);
    expect(games.value).toBe('flappy');
    expect(tiers.options).toHaveLength(TRACKSETS.flappy.length);

    // switching cabinet reloads the bench from that game's stock loop
    games.value = 'loot';
    change(games);
    expect(bench().gameId).toBe('loot');
    expect(bench().track.lead).toEqual(TRACKSETS.loot[0].lead);
    expect(bench().track.bass).toEqual(TRACKSETS.loot[0].bass);

    // switching tier loads the milestone variant (its own notes and tempo)
    tiers.value = '2';
    change(tiers);
    expect(bench().tier).toBe(2);
    expect(bench().track.lead).toEqual(TRACKSETS.loot[2].lead);
    expect(bench().track.bpm).toBe(TRACKSETS.loot[2].bpm);

    // three lanes, each with its own piano roll
    const tabs = [...root.querySelectorAll('#synth-voices button')];
    expect(tabs.map((b) => b.textContent)).toEqual(['LEAD', 'BASS', 'DRUM']);
    click(tabs[1]);
    expect(bench().voice).toBe('bass');

    // CLEAR silences a lane…
    click(root.querySelector('#synth-clear'));
    expect(bench().track.bass.every((n) => n === 0)).toBe(true);

    // …and a click plants a note at that pitch, immediately
    click(tabs[0]);
    const cell = root.querySelector('.synth-cell[data-step="0"]');
    const pitch = Number(cell.dataset.row);
    expect(pitch).toBeGreaterThan(0);
    click(cell);
    expect(bench().track.lead[0]).toBe(pitch);
    expect(cell.classList.contains('on')).toBe(true);

    // RUN arms the loop; HALT releases it
    const play = root.querySelector('#synth-play');
    click(play);
    expect(bench().playing).toBe(true);
    expect(play.textContent).toBe('■ HALT');
    await vi.advanceTimersByTimeAsync(1000); // a real bar of the loop elapses
    click(play);
    expect(bench().playing).toBe(false);
    expect(play.textContent).toBe('▶ RUN');

    expect(problems(), problems().map((p) => `${p.method}: ${p.text}`).join('\n')).toHaveLength(0);
  });

  it('SAVE bakes the remix into the cabinet; RESTORE gives the stock loop back', { timeout: 20000 }, async () => {
    await boot();
    App.open('composer');

    // silence the stock lead and plant one note at step 0
    click(synthRoot().querySelector('#synth-clear'));
    const cell = synthRoot().querySelector('.synth-cell[data-step="0"]');
    const pitch = Number(cell.dataset.row);
    click(cell);
    expect(bench().track.lead.filter((n) => n > 0)).toEqual([pitch]);

    // SAVE persists it under that cabinet + tier
    click(synthRoot().querySelector('#synth-save'));
    const saved = window.__broStore.remixFor('flappy', 0);
    expect(saved).toBeTruthy();
    expect(saved.lead[0]).toBe(pitch);
    expect(saved.lead).toHaveLength(16);

    // reopening the editor puts the saved remix back on the bench
    App.close('composer', { silent: true });
    App.open('composer');
    expect(bench().track.lead[0]).toBe(pitch);
    expect(bench().track.lead.filter((n) => n > 0)).toEqual([pitch]);

    // and the ARCADE's sequencer now voices the remix, not the stock loop:
    // open the arcade (which builds the shared sequencer) and step it once.
    App.close('composer', { silent: true });
    App.open('arcade');
    const { audio } = await import('../src/audio.js');
    const leadSpy = vi.spyOn(audio, 'leadNote').mockImplementation(() => {});
    window.__broGameMusic.startMusic('flappy');
    window.__broGameMusic.stepOnce();
    window.__broGameMusic.stopMusic();
    const voiced = leadSpy.mock.calls.map(([f]) => f);
    expect(voiced.some((f) => Math.abs(f - midiFreq(pitch)) < 1e-6)).toBe(true);
    expect(voiced.some((f) => Math.abs(f - midiFreq(TRACKSETS.flappy[0].lead[0])) < 1e-6)).toBe(false);

    // RESTORE STOCK drops the remix and reverts the bench to the original loop
    App.close('arcade', { silent: true });
    App.open('composer');
    click(synthRoot().querySelector('#synth-restore'));
    expect(window.__broStore.remixFor('flappy', 0)).toBe(null);
    expect(bench().track.lead).toEqual(TRACKSETS.flappy[0].lead);
    expect(bench().track.bpm).toBe(TRACKSETS.flappy[0].bpm);

    expect(problems(), problems().map((p) => `${p.method}: ${p.text}`).join('\n')).toHaveLength(0);
  });
});
