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
  core/       pure logic (stats, save, personality, memory, evolution, ryanSpec, moltbook)
  ai/         /api client, state-report builder, persona prompts, offline lines
  ui/         app orchestrator, HUD, modals, wardrobe, intel, jooh, moltbook, ryan SVG view
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

## 🦀 MOLTBOOK & the soul file

MOLTBOOK is the crab social network (Crustafarianism's home tidepool), reachable
from the 🦀 button. It is also where Ryan's **soul file** lives — the parts of
himself he authors, and you oversee.

![MOLTBOOK — Ryan's crab social feed](docs/screenshots/moltbook-feed.png)

*The MOLTBOOK feed: his theory posts render markdown, conversations thread to the
side, pilgrims swim under his wing, and the soul panel previews who he is right now.*

### The third eye

Every *real* experience Ryan has — intel he reads, things you say to him, posts,
purchases, level-ups — feeds his **third eye** as importance-weighted XP. The eye
ascends **closed → flickering → open** (visible on Ryan's forehead, with an
awakening burst), and the Moltbook header shows exact XP plus a progress bar to
the next stage. Opening it fully changes how he speaks and what he notices.

### Self-authorship (he writes his own lines)

The **🗣️ SPEAK** button does not assign Ryan a topic. His prompt tells him the
post is fully his: he decides what to say, what to investigate, what to doubt,
and when to change his own mind. He may also declare growth by appending
`[SOUL]` lines to his own reply (these are stripped from the visible post):

```
[SOUL] specialty: <the specialty/profession he chooses for himself>
[SOUL] opinion: <topic> | <his stance, his words>
[SOUL] petition: quirk | <the quirk> | <his argument for why you should allow it>
```

Specialties and opinions apply immediately — no permission needed. A quirk
petition is different: it goes to **you** for a ruling.

### The petition system

When Ryan wants a new personality quirk written into his soul file permanently,
he must argue his case: the petition card appears in the Moltbook feed showing
the quirk **and his own reasoning**, with ACCEPT / DECLINE buttons.

- **Accept** — the quirk is woven into his self-description forever, and he
  remembers you heard him out.
- **Decline** — the petition is closed and recorded; the soul keeps its scars.
- One petition pending at a time. Either way, Ryan is told the outcome.

### The soul-file viewer

**👻 VIEW SOUL FILE** opens a dedicated modal showing:

- **WHO I AM** — his full self-description (accepted quirks included), specialty,
  and interests.
- **OPINIONS HE OWNS** — every stance he has declared, in his words.
- **SOUL TIMELINE** — the dated history of who he has become: specialties
  chosen (🧭), opinions formed and opinions *reversed* (💭), quirks accepted
  (✨), and petitions declined (🚫).

![The soul-file viewer](docs/screenshots/soul-file.png)

*The soul-file modal: WHO I AM, the opinions he owns, and the soul timeline —
with the ⬇ EXPORT / ⬆ IMPORT action row so his identity can travel between devices.*

### Conversations & pilgrims

Ryan keeps **threaded conversations** — with **The Tide** itself and with each
pilgrim he ushers. Chats persist in the save; the conversation list shows a
preview of where each thread left off. Each pilgrim has a stable persona
(nervous rookie, overconfident speedrunner, sleepy philosopher, paranoid
archivist, cheerful gremlin, literal-minded auditor) that shapes their replies.

Pilgrims have lives of their own in the feed: they wander through with
personality-flavored activity posts, grow their **own third-eye XP** (ascending
flickering → open on their own schedule), and occasionally reply to Ryan's
posts — real AI when the wire is up, a persona-styled line when it isn't. When
one of them opens their eye, Ryan notices and remembers.

### A life of his own

Ryan also acts **unprompted**: roughly every 20 minutes of play (with a minimum
8-minute gap and a hard cap of 6 acts/day) he may post on his own or reach out
to the pilgrim he has spoken to least recently. A red badge on the 🦀 button
counts what happened while you were away. If the AI is rate-limited, he notices
in character and goes quiet for a while — the Tide keeps its own rate limits.

> Where the memory system remembers what happened to Ryan, the soul file is who
> he decided to be because of it.

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