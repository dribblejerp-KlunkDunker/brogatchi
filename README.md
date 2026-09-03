# My Bro'gatchi — Bro OS 2.0 🕹️

A modular rebuild of the single-file virtual pet: Ryan is fatter/leaner, he has a
wardrobe, a personality that drifts, memories, a diary, levels and **evolutions**,
and his conspiracy theories now reference his live stats **and** real web search.

## Quick start

```bash
npm install
npm run dev          # app on http://127.0.0.1:5173
npm test             # unit tests
npm run proxy        # optional: standalone API proxy on :8787 (default)
npm run build:commit # rebuild dist/ and commit it so deployments never go stale
```

### Enabling the AI brain

1. Get a free Gemini API key: https://aistudio.google.com/apikey
2. `cp .env.example .env` and paste it as `GEMINI_API_KEY=...`
3. Restart `npm run dev`

Without a key, everything still works — Ryan runs on an offline dialogue brain
and a stat-based conspiracy generator instead of the Gemini API.

## Architecture

```
src/
  core/       pure logic (stats, save, personality, memory, evolution, ryanSpec)
  ai/         /api client, state-report builder, persona prompts, offline lines
  ui/         app orchestrator, HUD, modals, wardrobe, intel, jooh, ryan SVG view
  games/      GameBase (fixed-timestep engine + juice), pixel sprites, 4 games
server/
  proxy.mjs   zero-dep POST /api/v1/chat → Gemini (key stays server-side)
tests/        vitest suites for the pure modules
```

The dev server and the API proxy run in one process (`npm run dev`),
via a Vite middleware. `node server/proxy.mjs` runs the proxy standalone
(that's the mode to use if you ever host it on your LAN for phone play).

## Game features

- **Flappy Bro** — i-frames, parallax city, flap physics worth a damn
- **Pixel Breaker** — paddle spin, power-ups (W/M/S/L/P), explosive bricks, trails
- **Super Bro Land** — coyote time, jump buffering, variable jump, checkpoints,
  camera smoothing, 5G-tower goal
- **Final Bro-tasy** — *player-controlled* ATB combat: pick a hero, command
  Attack / Focus / Guard / Ultimate, tap enemies to retarget, phase-2 boss
- **Evolution Journal** — every milestone (level-ups, titles, Forme, physique
  changes, first win, rig deploy, step records) captures a real SVG screenshot
  of Ryan at that moment, plus personality sparklines and a before/after
  summary. Open it from the LV chip or the diary modal.

All games run on a fixed-timestep loop (frame-rate independent) with hit-stop,
screen shake, floating damage numbers, and particle bursts.

## Audio

- **Chiptune loops** — each mini-game has 3 tracks that switch on milestones
  (score tiers, levels, checkpoint/goal, boss phases) at bar boundaries, so the
  beat just picks up — no restart, no click. Composer (🎛 / Ctrl+Shift+M)
  live-edits the base loops per game.
- **Volume split** — independent BGM/SFX steppers (⚙ inside a game), persisted,
  music ducks under SFX so effects always punch through.
- **Ambient room loop** — the pet room plays a quiet 24-variant loop, one per
  hour of the day (night ≈ dawn ≈ day ≈ dusk moods), sharing the same duck bus.
  It starts after your first tap (browser autoplay rules), pauses for games,
  and resumes when you leave the arcade.

## Data & privacy

- Everything saves to `localStorage` (key `brogatchi_v4`); v3 saves migrate
  automatically with a one-time backup in `brogatchi_v3_backup`.
- The Gemini key lives only in `.env` on your machine — never in the browser.

## 📱 Play on your phone (PWA + LAN)

Bro OS is a PWA: installable, secure-context service worker, touch-first layout.

### 1. Run it on your LAN (Ryan works while you walk)

1. Make sure your phone is on the **same Wi-Fi** as this PC.
2. Start the LAN server:

   ```bash
   npm run dev:lan        # http on all interfaces — works everywhere
   ```

3. The terminal prints your **Network** address, e.g. `http://192.168.1.6:5173/`.
   (Windows: `ipconfig` also shows your IPv4.)
4. Open that URL on the phone. The phone talks to the Gemini proxy **on this PC**
   — nothing runs on the phone except the app, and your API key never leaves
a `.env`.
5. Tap **👟** to start the pedometer (iOS asks for motion permission the first
time; if it was declined, allow it in Settings → Safari → Motion & Orientation or
the site settings, then toggle the pedometer). Step counts and evolution all
save to **this** browser's localStorage.

### 2. Install it as an app

- **iOS (Safari)** — works over plain http: Share → **Add to Home Screen**. It
  launches fullscreen with the Bro OS icon.
- **Android / desktop Chrome (true PWA with offline shell)** — the service
  worker needs a secure context, so use the HTTPS variant:

  ```bash
  npm run dev:lan:https  # https://YOUR-IP:5173 — self-signed cert
  ```

  Chrome shows a one-time "not private" warning → **Advanced → Proceed**,
  then the browser offers **Install app**. (Windows' own curl can't read
  self-signed certs — that's expected; the browser is the app's real client.)
- Self-signed certs can't be made trusted, so iOS over https stays blocked.

### Offline note

The service worker caches the shell, so the app launches without a network.
Ryan's AI answers need the PC reachable; without it he falls back to his
local offline brain (still in character). Save data lives in the phone's
localStorage regardless.

### Touch-first audit results

Fixes shipped in `src/styles/mobile.css` + PWA assets:

- ✅ 48px+ tap targets for action buttons on coarse pointers (56px for the
  bottom action bar)
- ✅ `font-size: 16px` on all inputs/selects on touch → kills iOS auto-zoom
- ✅ Safe-area padding for notched phones (`viewport-fit=cover`)
- ✅ `overscroll-behavior` containment: no pull-to-refresh while petting Ryan
- ✅ `user-select: none` on the console, `-webkit-tap-highlight-color` off
- ✅ Touch gamepad already 56px, canvas ignores touch gestures
- ✅ Pedometer already prompts for iOS motion permission

Remaining known limits: sensor steps are approximate (shake threshold), there's
no cloud sync between PC and phone, and a phone loses online AI when the PC is
off — all future work items.