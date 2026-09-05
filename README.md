# Bro OS 3.0 — Cyberpunk Utility 🕹️👁️

The Bro'gatchi rebuild, promoted from dense single-page pet app to a full
**windowed desktop operating system** in the *Cyberpunk Utility* aesthetic.
Ryan the rogue AI lives in a secure terminal window, J.O.O.H. watches from a
glowing surveillance shell, the tidepool (Moltbook) hums under a third eye,
and every click sounds like a square wave.

> **Status: Phase 1–5 of the Bro OS 3.0 Enhancement Plan — implemented.**
> Chosen aesthetic: **Cyberpunk Utility** (chosen in the planning session).

## Quick start

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # vitest — state core suite
npm run build      # production bundle → dist/
npm run icons      # regenerate PWA icons (zero-dep PNG encoder)
```

Optional AI wiring: `cp .env.example .env` with `GEMINI_API_KEY=…` and Ryan
answers through the zero-dep proxy (`server/proxy.mjs`, key never leaves your
machine). Without a key he answers from his **offline brain** — same paranoia,
zero latency.

## What changed from 2.0 → 3.0

### Phase 1 — Design system & theming foundation
- Tailwind v4 **CSS-first `@theme` token system** in `src/style.css`:
  the Void & the Machine palette (`void/panel/border`), four neon accents
  (`cyan/magenta/amber/green`), Orbitron + Rajdhani + Share Tech Mono,
  neon shadow tokens.
- **Theme engine**: `CYBERPUNK UTILITY` (base), `RGB GAMER`, `AREA 51`,
  `HIGH CONTRAST` (WCAG-minded: glow removed, fat focus rings) — swapped by
  one `data-theme` attribute.
- CRT scanlines (click-through, toggleable), terminal scrollbars,
  glow/glitch/cursor-blink utilities.

### Phase 2 — Core shell & navigation
- Real desktop environment: **top system bar** (REC, live clock, PWR, CR,
  STP, LV), **desktop widget grid**, **bottom dock** (8 apps), and a
  **window manager**: draggable, focusable, minimize / maximize / close,
  z-stacking, cascade spawn, ESC to close.

### Phase 3 — Feature modules (lore-accurate)
- **PET.VIEWPORT // CONTAINMENT** — Ryan inside animated holographic rings
  with shimmer overlay; emoji form reacts to vitals (😎🥺😪🤑😴🐚).
- **VITALS.TELEMETRY** — glowing HPY/HNG/NRG/GRD bars that alarm-pulse
  when critical; XP readout.
- **CHAT.SYS // RYAN_AI** — secure uplink terminal: handshake boot lines,
  typing indicator, offline brain that references live stats, wired path
  to the Gemini proxy when a key exists.
- **MARKET.TERMINAL** — working shop (pizza / NRG cells / shield module /
  golden shell) with denial flashes and coin-fly animation.
- **J.O.O.H. SURVEILLANCE** — hacker terminal with ambient chatter,
  HACK MAINFRAME (-5 NRG, +10 CR), rising TRACE level and shield-audit
  interaction, screen shake + decryption audio.
- **MOLTBOOK // TIDEPOOL** — feed, third-eye XP bar (CLOSED → FLICKERING →
  OPEN), posting, and pilgrims that sometimes answer back.
- **SOUL.FILE** — WHO I AM / quirks / opinions / soul timeline.
- **SYSTEM.CFG** — theme select, scanlines, BGM/SFX steppers, factory reset.

### Phase 4 — Micro-interactions, audio & polish
- **`src/audio.js`**: zero-asset Web Audio chiptune engine — window
  open/close, clicks, coin chime, eat/pet/sleep, level-up arpeggio, hack
  scramble, typing blips; independent SFX/BGM volumes.
- Screen shake, coin-fly particles, toast notifications, SYS.LOG live feed,
  boot sequence overlay.
- A11y pass: `aria-label`s on the dock and icon buttons, `aria-live` on
  chat/log/terminal, focus-visible outlines everywhere, ESC handling.

### Phase 5 — Optimization, responsiveness & launch
- Media queries: stacked 2-column widget grid on mobile, near-fullscreen
  window snapping, scrollable dock, drag disabled on touch.
- **CHIPTUNE.SYNTH** sequencer (8-step × 5-row pentatonic) — playable,
  BPM slider, presets.
- **ARCADE.SYS** — SNAKE.EXE is fully playable (keyboard + touch d-pad,
  CR/XP rewards, persisted best score); BREAKER/DUNGEON/FLAPPY queued.
- PWA: `public/manifest.json` + generated pixel icons; relative base so the
  bundle deploys on any subpath.

## New features beyond the plan

| Feature | Where |
|---|---|
| Live pet simulation (decay, offline catch-up capped at 8h, sleep regen) | `src/state.js` |
| Passive mining rig (+1 CR / 6s) feeding a real daily quest | `src/state.js` |
| DAILY.QUEST ticker with one-time +50 CR payout | desktop widget |
| SYS.LOG (`tail -f` style event feed) | desktop widget |
| Ryan offline dialogue brain with stat-aware replies | `src/main.js` |
| Playable SNAKE.EXE with fixed-timestep loop | `src/apps/snake.js` |
| Playable step-sequencer CHIPTUNE.SYNTH | `src/apps/synth.js` |
| Zero-dep PNG icon generator (`npm run icons`) | `scripts/gen-icons.mjs` |
| Unit-tested state core (vitest) | `tests/state.test.js` |
| Gemini proxy kept key-safe & quota-resilient (503 → offline brain) | `server/proxy.mjs` |

## Architecture

```
index.html            shell, widgets, dock, all <template> app bodies
src/
  main.js             window manager + app wiring + render loop + boot
  state.js            pure, testable store (vitals, economy, quests, soul)
  audio.js            Web Audio chiptune engine (zero assets)
  style.css           Tailwind v4 @theme tokens + components + themes
  apps/snake.js       SNAKE.EXE arcade core
  apps/synth.js       CHIPTUNE.SYNTH sequencer
server/proxy.mjs      zero-dep Gemini proxy (dev middleware or standalone)
scripts/gen-icons.mjs dependency-free PWA icon renderer
tests/state.test.js   vitest suite for the state core
```

State persists to `localStorage[bro_os_3]`. Factory reset lives in
SYSTEM.CFG.

## 🧠 Ryan's memories — migration & protection

Losing what Ryan remembers is treated as a disaster, so 3.0 ships a
defense-in-depth memory system:

- **Automatic 2.0 → 3.0 migration.** On first boot, if a 2.0 save exists
  (`brogatchi_v4`, falling back to `brogatchi_v3_backup` / `brogatchi_v3`),
  Ryan imports his **memories, diary, conversations, soul file (who /
  quirks / opinions / timeline), third-eye XP, coins, XP and steps**.
  The migration is strictly **read-only**: the original save is never
  modified or deleted. Run 3.0 on the same origin (host:port) you played
  2.0 on and he wakes up remembering everything.
- **Raw legacy snapshot.** The entire 2.0 save is archived verbatim under
  `bro_os_3_legacy_snapshot`, independent of the live state.
- **Tiered redundancy (`src/persist.js`).** The soul is mirrored into four
  independent failure domains: `localStorage` primary (every mutation),
  `localStorage` backup (throttled ≥10 s), `sessionStorage` (every sync),
  and `IndexedDB` (5 s interval writer). On boot, a recovery cascade
  restores from the freshest mirror if the primary is missing or corrupt —
  proven end-to-end by a power-loss simulation in E2E.
- **Auto-export on every interaction.** Each state mutation re-mirrors the
  soul (session instantly, backup throttled, IDB on its interval) plus a
  30 s heartbeat and forced syncs on tab-hide/unload. All writes are plain
  `setItem` calls on an already-serialized string — negligible cost.
  👻 SOUL.FILE shows a live **MEMORY REDUNDANCY** panel (tier status +
  last auto-export) and a FORCE SYNC button.
- **SOUL.FILE → ⬇ EXPORT / ⬆ IMPORT.** Exports the complete soul (state +
  memories + diary + legacy snapshot) as JSON — downloaded *and* copyable —
  and imports it anywhere else. Import also accepts pasted 2.0-era soul
  exports and raw legacy saves, so memories can travel across origins,
  phones, and cleared site data.
- **Volatile environments.** When `localStorage` is unavailable (sandboxed
  viewers, strict private modes), the OS boots RAM-only, warns in SYS.LOG,
  toasts once, and shows `PERSISTENCE: VOLATILE ⚠` in SYSTEM.CFG — export
  before closing and nothing is lost.
- **Factory reset** wipes only `bro_os_3` + the snapshot; legacy 2.0 keys
  survive and re-import on next boot.
- SOUL.FILE displays everything on record: MEMORIES, DIARY, SOUL TIMELINE,
  and a LEGACY ARCHIVE panel reporting what was imported, from where, and
  how much.

Covered by `tests/state.test.js` (migration, nested schemas, export/import
round-trips, reset safety) — `npm test`.

## Roadmap — next shells

1. BREAKER.EXE and FLAPPY.BRO arcade cores on the same fixed-timestep bus.
2. Pedometer (DeviceMotion) wired to STP + IRL quests.
3. Ryan's petitions & self-authorship (`[SOUL]` lines) from 2.0, re-skinned
   for the terminal.
4. Service worker shell for true offline PWA install.
5. Cloud sync codes (the ☁️ promise from 2.0).

*The tidepool remembers.*
