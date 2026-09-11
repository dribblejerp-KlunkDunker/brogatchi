# REPO MAP — what lives where, and how to run it

One screen for orientation. **When you move or add a top-level directory,
update this map in the same commit.**

## The three runnable parts

| Part | What it is | Run it |
|---|---|---|
| **App** (Bro OS 3.0 shell) | Windowed desktop OS: pet viewport, Ryan AI chat, arcade, Moltbook, PIXEL.STUDIO, soul file | `npm run dev` → http://127.0.0.1:5173 |
| **Arcade** (inside the app) | Five cabinets + sprite-override system + chiptune BGM | Open ARCADE.SYS from the in-app dock |
| **Bridge** (KlunkDunker) | Zero-dep Node agent posting Ryan's soul to the real Moltbook network | `node bridge/cli.js help` (see below) |

```bash
npm install          # once
npm run dev          # app + /api proxies, hot reload
npm test             # the whole vitest suite (app + bridge)
npm run build        # production bundle → dist/ (commits to dist/ feed GitHub Pages)
npm run preview      # serve dist/ at :4173 (with the same /api proxies)
```

## Where things live

```
index.html                  the shell: system bar, dock, every window's <template>
src/
  main.js                   window manager, app wiring, render loop, boot
  state.js                  the store — vitals, economy, quests, Moltbook, sprite
                            overrides, memories (pure & testable; imports below)
  memory.js                 memory engine (importance, pins, fading, bridge import)
  personality.js            2.0 trait core (ego/greed/…) feeding the AI prompt
  persist.js                storage redundancy (localStorage + fallbacks)
  audio.js                  Web Audio chiptune engine (zero assets)
  gameMusic.js              per-game BGM + tier variants + remix hooks
  arcadeCore.js             cabinet host: mounts a game, score/game-over flow
  style.css                 Tailwind v4 @theme tokens, 4 themes, CRT/glow utilities
  sw.js                     service worker (build-stamped cache busting)
  apps/
    pixelstudio.js          PIXEL.STUDIO — paint, save to gallery, apply as game art
    synth.js                CHIPTUNE.SYNTH — sequencer + live game-BGM remix lab
    snake.js                SNAKE.EXE
  games/
    sprites.js              the 15 named bank sprites (native pixel format)
    overrides.js            THE one resolution point: getSprite() = painting or bank
    GameBase.js, mario.js, flappy.js, loot.js, rpg.js, breaker.js, pixel.js
  fonts/                    self-hosted woff2 (OFL) — zero third-party requests
server/
  proxy.mjs                 Gemini chat proxy (dev/preview middleware or standalone)
  bridge-soul.mjs           /api: soul export for the bridge
  bridge-status.mjs         /api: harness state.json + caps + actions.log for BRIDGE.SYS
badges/
  tests.json                tests-badge endpoint; CI verifies it against the real
                            suite count on every run (a stale badge fails CI)
bridge/                     the KlunkDunker autonomy harness (zero npm deps)
  cli.js                    setup, status, once, daemon, dm, remember, play,
                            recall, sync, on, off   ← `node bridge/cli.js help`
  src/                      agent, voice (Gemini persona from trait core), memory,
                            moltbook client, bridgeSync (jsonl → app snapshot)
  state.json, memory.jsonl  the harness's live state and action log (tracked)
  identity/                 exported soul file the harness speaks with
  test/                     bridge tests (run by the root vitest suite)
scripts/
  gen-icons.mjs             dependency-free PWA icon renderer (npm run icons)
  build-preview.mjs         builds preview.html (npm run preview:app)
tests/                      vitest suites: state core, memory, moltbook, arcade,
                            pixelstudio, overrides, bridge endpoints + UI, chat,
                            soak/console-silence gates (jsdom boots the real shell)
dist/                       committed build output — GitHub Pages deploys from it;
                            rebuild + commit whenever src/ changes
docs/                       bug reports, specs (superpowers), this map
.github/workflows/
  ci.yml                    every push: vitest suite → badge truth-check → build
                            → dist freshness gate
  deploy-pages.yml          deploys dist/ to GitHub Pages
  release.yml               any v* tag → GitHub Release with generated notes
```

## How the parts connect

- **One store.** Everything in the shell reads/writes `createStore()` from
  `src/state.js`; it persists to `localStorage[bro_os_3]` and emits to
  subscribers. Windows are dumb renderers over store state.
- **Painted art → gameplay.** PIXEL.STUDIO (or the Moltbook gallery's EQUIP)
  binds a painting to a bank sprite; `src/games/overrides.js::getSprite()` is
  the only place games ask for art, so overrides apply mid-run.
- **Soul → bridge.** SOUL.FILE exports Ryan's soul (memories, traits, quirk);
  the bridge's persona prompt is built from it, and the harness's actions flow
  back as `bridge-memory-log.json` → imported on boot (never duplicated).
- **AI never ships your key.** The app talks to `/api/chat` (vite middleware
  wrapping `server/proxy.mjs`); `GEMINI_API_KEY` stays in `.env` on your
  machine. No key → Ryan answers from his offline brain.
