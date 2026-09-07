// UI integration tests for the restored arcade: boots the REAL
// index.html + main.js in jsdom, opens the ARCADE window, launches
// the restored 2.0 games through real card clicks, drives the live
// instances (canvas.__game), and verifies the payout path (CR, XP,
// best scores) through the store-backed HUD.
// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

const SHELL_HTML = readFileSync('index.html', 'utf8');

const realConsoleError = console.error;
let realGetContext;
beforeAll(() => {
  console.error = (...args) => {
    if (String(args[0]).includes('Not implemented')) return;
    realConsoleError(...args);
  };
  // jsdom's canvas has no 2D context (the `canvas` package isn't installed).
  // The 2.0 GameBase render loop needs one — stub it with a self-recording
  // proxy that absorbs every call and gradient factory.
  realGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext');
  const ctxStub = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return null;
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') {
        return () => ({ addColorStop() {}, });
      }
      if (prop === 'measureText') return () => ({ width: 10 });
      return typeof prop === 'string' ? () => {} : undefined;
    },
    set() { return true; }, // absorb property writes (fillStyle, font, …)
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: () => ctxStub,
    configurable: true,
  });
});
afterAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', realGetContext);
  console.error = realConsoleError;
});

let App;

async function bootShell() {
  document.head.innerHTML = SHELL_HTML.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
  document.body.innerHTML = SHELL_HTML.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1] ?? '';
  document.documentElement.setAttribute('data-theme', 'cyberpunk');
  await import('../src/main.js');
  App = window.App;
  // Deterministic slate through the app's own factory reset (module state
  // can leak between tests in this environment).
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  App.open('settings');
  App.windows.get('settings').el.querySelector('.window-content #reset-data').click();
  confirmSpy.mockRestore();
  App.close('settings', { silent: true });
}

function arcadeContent() {
  App.open('arcade');
  return App.windows.get('arcade').el.querySelector('.window-content');
}

// Launch a game through the real cabinet button and return the live
// instance hosted by arcadeCore.
function launch(gameKey) {
  const c = arcadeContent();
  const card = c.querySelector(`button[data-game="${gameKey}"]`);
  if (!card) throw new Error(`no cabinet for ${gameKey}`);
  card.click();
  const cvs = c.querySelector('#game-canvas');
  return { content: c, game: cvs?.__game ?? null, cvs };
}

function coinsOnHud() {
  return Number(document.getElementById('sys-coins').textContent);
}
function xpOnHud() {
  return document.getElementById('stat-xp').textContent;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const id of [...(App?.windows?.keys?.() ?? [])]) App.close(id, { silent: true });
  window.App = undefined;
  vi.resetModules();
});

describe('arcade cabinet grid', () => {
  it('shows 6 playable cabinets + 2 sealed slots, each with a best-score readout', async () => {
    await bootShell();
    const c = arcadeContent();
    const playable = [...c.querySelectorAll('button[data-game]')].map((b) => b.dataset.game);
    expect(playable.sort()).toEqual(['breaker', 'flappy', 'loot', 'mario', 'rpg', 'snake']);
    expect(c.querySelectorAll('[data-game]').length).toBe(6); // buttons only (sealed slots are divs without the attr)
    expect(c.querySelectorAll('.arcade-best').length).toBe(6);
    expect(c.textContent).toContain('6 CORES RESTORED');
  });

  it('shows the persisted snake best on the cabinet', async () => {
    await bootShell();
    const c = arcadeContent();
    // snake best starts at 0 on the fresh slate
    expect(c.querySelector('.arcade-best[data-best="snake"]').textContent).toBe('0');
  });
});

describe('launching and hosting restored games', () => {
  it('LOOT SHOWER hosts a live instance with a HUD and teardown wiring', async () => {
    await bootShell();
    const { game, content, cvs } = launch('loot');
    expect(cvs).toBeTruthy();
    expect(game).toBeTruthy();
    expect(game.key).toBe('loot');
    expect(game.lives).toBe(3);
    expect(content.textContent).toContain('LOOT SHOWER // RUNNING');
    expect(content.querySelector('#game-score')).toBeTruthy();
    expect(content.querySelector('#game-lives').textContent).toContain('❤️');
    expect(content.querySelector('#btn-left')).toBeTruthy(); // pad shown for loot
  });

  it('FINAL BRO-TASY starts in story phase and advances on canvas tap', async () => {
    await bootShell();
    const { game } = launch('rpg');
    expect(game.phase).toBe('story');
    game.onPointer(200, 400);
    game.onPointer(200, 400);
    game.onPointer(200, 400);
    expect(game.phase).toBe('combat');
    expect(game.heroes.length).toBe(3);
    expect(game.enemies.length).toBe(2);
  });

  it('BACK TO ARCADE stops the loop and rebuilds the cabinet grid', async () => {
    await bootShell();
    const { content, game } = launch('breaker');
    expect(game.running).toBe(true);
    content.querySelector('#game-back').click();
    expect(game.running).toBe(false);
    // resetGrid closes+reopens the arcade window — look up the FRESH window
    expect(arcadeContent().querySelector('button[data-game="snake"]')).toBeTruthy();
  });

  it('closing the arcade window mid-run stops the game (no zombie loops)', async () => {
    await bootShell();
    const { game } = launch('flappy');
    expect(game.running).toBe(true);
    App.close('arcade');
    expect(game.running).toBe(false);
  });
});

describe('payout path', () => {
  it('a loot run pays CR + XP, records the best score, and shows the run panel', async () => {
    await bootShell();
    const coinsBefore = coinsOnHud();
    const { content, game } = launch('loot');

    // simulate a real run: score points, then die out (loot.js pays max(5, score×2))
    game.score = 25;
    game.gameOver(50);

    expect(coinsOnHud()).toBe(coinsBefore + 50);
    const [xpNow] = xpOnHud().split('/');
    expect(Number(xpNow)).toBeGreaterThanOrEqual(12); // floor(score/2) = 12
    expect(content.textContent).toContain('RUN COMPLETE');
    expect(content.textContent).toContain(`SCORE 25`);
    expect(content.textContent).toContain('+50 CR');
    // best recorded on the cabinet after returning
    content.querySelector('#game-exit').click();
    expect(arcadeContent().querySelector('.arcade-best[data-best="loot"]').textContent).toBe('25');
  });

  it('a lower subsequent run does not lower the best', async () => {
    await bootShell();
    const { content, game } = launch('flappy');
    game.score = 30;
    game.gameOver(65); // max(5, score*2)
    content.querySelector('#game-exit').click();

    const { content: c2, game: g2 } = launch('flappy');
    g2.score = 4;
    g2.gameOver(5);
    c2.querySelector('#game-exit').click();
    expect(arcadeContent().querySelector('.arcade-best[data-best="flappy"]').textContent).toBe('30');
  });

  it('RE-RUN relaunches the same cabinet', async () => {
    await bootShell();
    const { content, game } = launch('breaker');
    game.gameOver(10);
    content.querySelector('#game-again').click();
    const cvs2 = content.querySelector('#game-canvas');
    expect(cvs2).toBeTruthy();
    expect(cvs2.__game).not.toBe(game);
    expect(cvs2.__game.running).toBe(true);
  });
});
