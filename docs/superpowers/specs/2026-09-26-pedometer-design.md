# The Pedometer — IRL Quests — Design Spec

**Date:** 2026-09-26
**Status:** ✅ Shipped — implemented as specced (`src/pedometer.js` + store plumbing + STEP.SYNC section + IRL.QUEST lane + trainer retirement; 20 new tests). Two deviations the build surfaced: **(1)** the reward event needs a **deferred-event queue** — `addSteps` runs outside `tick()`'s event array, so the store parks the STP line in `state._deferredEvents` and the shell drains it on the next tick (pushing into `tick()`'s local array was a ReferenceError the live prototype caught); **(2)** the toggle calls `renderAll()` immediately so the IRL.QUEST row appears the moment the sensor goes on, not up to 1s later on the tick. Also shipped beyond the letter: **boot re-attach** (a save with `enabled: true` silently calls `start()` at boot — desktop Chromium re-grants, iOS refusal shows TAP TO RESUME and the toggle re-arms), and the reward caps the daily lane at `goal` while the lifetime counter keeps counting.
**Program:** v3.4.0 "the body release" — front 1 of three (1: pedometer IRL quests → 2: dream-on-return → 3: notification nudges).

## Motivation

The 3.3 journal release gave Ryan an inner life — a diary, petitions, memories that echo — but the app is still a fishbowl: nothing Ryan does is caused by the player's *body*. 2.0's strangest, best joke was that Ryan counts real steps. The README's roadmap still carries it as the only unshipped line besides cloud sync: **"Pedometer (DeviceMotion) wired to STP + IRL quests."** Meanwhile the sim already believes in it: `addSteps()` exists with 2.0's exact fitness wiring (+0.8 per 100 steps crossed), SYSTEM.CFG shows a lifetime `STP` readout, and 2.0 saves migrate their `steps` in — but nothing on Earth can produce a step. This spec gives the counter a pulse.

## Provenance note (honest)

2.0's pedometer *source* is not in the reconciled history — only its fingerprints survived:

- `addSteps(n)` in `src/state.js` carries the comment "2.0 pedometer wiring: fitness +0.8 per 100 steps crossed" — the store-side half of the feature shipped with the migration.
- The 2.0 save importer accepts `steps`/`stepCount`/`totalSteps` lanes (state.js:806), so 2.0 persisted a lifetime step counter and the value survived into v3 saves.
- SYSTEM.CFG renders `#sys-steps` (4-digit padded), and Ryan's dialogue jokes about pedometers three separate times ("J.O.O.H. is watching the pedometers AND the pizza orders").
- The v3.3 `trainer` petition ("Add a step goal to my daily quest") is the mechanic's fossil: 2.0 Ryan could ask for a step goal, but v3 had no step source to attach one to.

So the mechanics below are a **reconstruction**: the store half is 2.0's own code; the sensor half is rebuilt on 3.0's layering rules (browser APIs live in `main.js`-land, the store stays environment-free).

## The mechanic in one breath

The player opts in from SYSTEM.CFG; the phone's motion sensor counts real steps and feeds `addSteps()`. Steps accrue toward a daily **IRL.QUEST** (walk 2,000 steps) that sits beside the mining quest in the DAILY.QUEST panel, pays CR and fitness on completion, and becomes a pinned memory in Ryan's own voice. Desktop players get an honest DESK JOB fallback button; when the hardware lane exists, Ryan's low-tech `trainer` petition retires itself.

## Goals

- **Opt-in and quiet.** The sensor never runs before the player asks for it; the toggle persists like `bgmMuted` (the established pattern).
- **One store surface.** The sensor layer only ever calls `addSteps(n)` — every reward, trait shift, memory, and quest rollover is pure store logic, so tests inject steps without a browser and the seam stays one-way (the ghost `scrub-log` lesson).
- **The quest is real:** a daily lane with a reset at rollover, a one-time reward, and a pinned memory — same shape as the mining quest, not a floating progress bar.
- **Desktop parity:** no sensor is a designed mode (like offline chat), not a dead end — the DESK JOB button gives jsdom, CI, and desk-bound players the same lane.
- Ryan reacts: completing the IRL quest lands in his memories and diary through the existing `rememberEvent`/pairing machinery, so the body feeds the soul for free.

## Non-Goals (YAGNI)

- No HealthKit / Google Fit / background-step APIs — `DeviceMotionEvent` while the app is open, nothing else.
- No GPS, routes, or maps.
- No configurable goal in v3.4 — fixed 2,000 (a non-trivial but honest daily walk); revisit if players finish it daily.
- No step *history* graphs (lifetime STP + today's lane is enough; sparklines exist in SOUL.FILE already if wanted later).
- No permission nagging: one status line in SYSTEM.CFG, one toggle. If the browser refuses without a gesture, the button says so and re-arms.
- No arcade/mining integration beyond what `addSteps` already does — steps are their own lane.

## Data model

One new save field, healed by `normalizePedometer()` on load (same pattern as `normalizePetitions`):

```js
pedometer: {
  enabled: false,     // player opted in — persists across reloads
  goal: 2000,         // fixed in v3.4; field exists so 3.5 can make it configurable without migration
  today: {            // the daily IRL quest lane — reset at day rollover, like state.quest
    date: 'YYYY-MM-DD',
    steps: 0,
    rewarded: false,
  },
}
```

- Lifetime steps stay where they are: `state.steps`, fed by `addSteps`. The daily lane counts the same deltas.
- Session-only cursors (last peak timestamp, batch accumulator) live in module scope in the sensor layer — never in the save.
- `normalizePedometer()` drops malformed lanes, re-stamps `today.date` on load (yesterday's walk must not carry over), and coerces numbers — a corrupted field heals, never throws.

## The sensor layer — `src/pedometer.js` (~80 lines)

Lives outside the store by layering rule; exposes `start(store)` / `stop()`, called from `main.js`:

- **Attach:** `window.addEventListener('devicemotion', …)` while `pedometer.enabled && !document.hidden`. On iOS 13+ the toggle's click gesture calls `DeviceMotionEvent.requestPermission()` first (it must be user-initiated — the toggle *is* the gesture).
- **Counting heuristic (declared approximate):** use `accelerationIncludingGravity` magnitude; count a step when the signal crosses below `g − 1.2 m/s²` and back above `g` with ≥ 250 ms since the last count. This is a pedometer, not a lab instrument — 2.0's was a joke too.
- **Batching:** deltas accumulate in a module-local counter; `store.addSteps(batch)` fires at most every 3 s, so the store emitter doesn't spin at sensor rate.
- **Desktop noise guard:** events whose `accelerationIncludingGravity` is null (some desktop browsers fire empty devicemotion) are ignored entirely.
- **Status surface:** the layer reports one of `OFF · LISTENING · UNSUPPORTED · DENIED · TAP-TO-RESUME` via a callback for SYSTEM.CFG to render. `TAP-TO-RESUME` covers the iOS case where a reload drops the grant — boot attempts an automatic attach, and the browser's refusal flips the status instead of prompting out of nowhere.
- **Boot re-attach:** if the save says `enabled`, `start()` is attempted at boot; refusal is silent and visible only as status text. The toggle remains the re-arm.

## The store half — `state.js`

`addSteps(n)` grows the daily lane (it is the *only* mutation surface, from any source):

1. Existing behavior unchanged: lifetime `steps += n`, fitness +0.8 per 100 crossed (capped per call).
2. New: `today.steps += n` (after rollover guard — if `today.date !== todayStr()`, reset the lane first, same inline-reset the mining quest does).
3. Reward check — exactly once: when `today.steps >= goal && !today.rewarded && goal > 0`:
   - `today.rewarded = true`, `coins += 40`
   - `applyEvents`: fitness +2, broCode +1 (2.0's quest wiring feeds both — same pair as the mining quest)
   - `rememberEvent('Walked 2,000 real steps today. The shell is portable.', { icon: '👟', imp: 4, pin: true })` — 2.0 voice, pinned like the mining-quest memory, so the diary pairs it automatically.
   - SYS.LOG event `{ tag: 'STP', text: 'IRL.QUEST complete — +40 CR. Touch grass, reported.' }`

`setPedometerEnabled(on)` — the toggle mutator (mirrors `setBgmMuted`), plus the `bgmMuted`-style heal line in the existing normalize pass.

**Rollover:** the day-rollover path re-stamps `pedometer.today` (date, zeroed steps, unrewarded) alongside `state.quest` — one more line in `maybeRolloverDiary`. Sabbath interactions do not exist: a granted sabbath zeroes the *mining* quest goal; the walk is Ryan's job regardless (rest is for the rig, not the legs).

## The trainer petition retires

`src/petitions.js`'s `trainer` trigger gains `&& !state.pedometer.enabled`. With a real step lane, Ryan's "add a step goal to my daily quest" ask is already answered by hardware — leaving it live would let him petition for something the player already gave him. When the pedometer is off (desktop, opted out), the petition is unchanged. No other generator reads the pedometer.

## UI

**SYSTEM.CFG — STEP.SYNC section** (below the save codes block):

```
STEP.SYNC                                    👟
status: LISTENING            today: 1,240 / 2,000
[ ENABLE STEP.SYNC ]  [ DESK JOB +250 ]
```

- Toggle button: label flips ENABLE/DISABLE; on enable it requests iOS permission if present, starts the layer, and persists `enabled`.
- Status line renders the five states in the window's voice; `UNSUPPORTED` adds "desk job mode is your friend."
- Progress bar under the row (same component style as quest progress); lifetime `STP` readout stays where it is.
- **DESK JOB +250**: the honest desktop lane — one button, +250 steps through the same `addSteps` (and therefore the same quest, rewards, and memories). Voice-appropriate label; it is a joke the sim takes seriously.

**DAILY.QUEST panel** (main viewport) — a second line under the mining quest, only while `pedometer.enabled`:

```
IRL.QUEST — WALK 2,000   [ 1,240 / 2,000 ]
```

Same progress treatment as TIDEPOOL NET; hidden entirely when the pedometer is off (no dead UI for the uninterested).

No new window, no new dock button.

## Persistence & interop (free rides)

- **Save:** one flat field; the save-code codec, soul export, and EXPORT FOR BRIDGE ship it with zero changes.
- **Bridge:** `identityFromEnvelope` already carries the whole state; `buildSystemPrompt` gains one line when `enabled && today.steps > 0`: *"He walked N real steps today"* — KlunkDunker can mention the walk without pretending to have legs.
- **MOLT JOURNAL:** the pinned completion memory pairs into the day automatically. Diary line at rollover comes from the memory, as with quests.
- **2.0 migration:** `addSteps` already absorbs imported `steps`; nothing to change.

## Testing plan

- **Store unit (`tests/pedometer.test.js`):**
  - `addSteps` grows lifetime + today lane; fitness cap unchanged (boundary at the 100-step crossings, per-call cap 10 → +8).
  - Reward fires exactly once at goal (goal−1: nothing; goal: +40 CR, traits, pinned memory; goal+1 after: still nothing more; overshoot in one call caps the lane and pays once).
  - Rollover resets the lane and `rewarded` (tick path and lazy re-stamp when `addSteps` is the first call after midnight); a reward on the old day does not suppress the new day's quest.
  - `setPedometerEnabled` persists; `normalizePedometer` heals a malformed/corrupt field without throwing and re-stamps a stale `today.date`; same-day lane survives a load.
  - Trainer suppression: generator fires at `fitness ≤ 15 && steps === 0` with pedometer off; returns null with it on (even with a zeroed lane — the toggle is the ask).
- **UI (`tests/pedometer.ui.test.js`, jsdom real shell):**
  - CFG section renders OFF/ENABLE/DESK JOB/progress; the IRL row is hidden while off.
  - Toggle click (with `DeviceMotionEvent` stubbed) shows LISTENING, flips to DISABLE, and the IRL.QUEST row appears immediately; DISABLE severs it and the row vanishes.
  - Sensorless boot (no stub — CI truth) reports NO SENSOR and keeps the save disabled.
  - DESK JOB clicks drive the real path: lane grows, crossing the goal pays exactly once (+40, 👟 memory pinned), further clicks pay nothing.
  - The STP reward reaches SYS.LOG via the deferred queue (drained on the next 1s tick), not a crash.
  - Reload persistence: enabled state and lane survive a boot (skips in storage-free jsdom environments — store-level suite covers it with injected storage).
  - Fresh boot with no save starts off with a zeroed lane.
- **Bridge (`tests/bridge-voice.test.js` additions):** an enabled lane with steps reaches the prompt verbatim; disabled or zero-step lanes never appear; a lane over the goal clips to the goal.
- **CI note:** jsdom has no sensors — every test drives the store directly or stubs `DeviceMotionEvent`; no test depends on real motion. The deployed-site boot check is unaffected (feature is dormant until opted in).

## Rollout

1. `state.js`: field + normalize + `addSteps` daily lane + reward + `setPedometerEnabled` + rollover line.
2. `src/pedometer.js`: sensor layer (pure browser side, status callback).
3. `main.js`: STEP.SYNC section in SYSTEM.CFG, IRL.QUEST line in the quest panel, boot re-attach.
4. `src/petitions.js`: trainer suppression (one condition).
5. Bridge prompt line in `bridge/src/voice.js`.
6. Tests: the two suites above (~16 cases), badge bump in the same commit, dist rebuild.
7. Live-verify in the preview: enable STEP.SYNC (stubbed sensor via `preview_evaluate` dispatching synthetic `devicemotion`), watch the quest line fill, DESK JOB across the goal, confirm the pinned memory, reload for persistence.

**Estimate:** mid-sized — smaller than petitions (no new decision UI, one seam, no history), and the store half of the work is literally 2.0's own code waiting for a source. The only genuinely new logic is ~80 lines of sensor layer and one reward branch.
