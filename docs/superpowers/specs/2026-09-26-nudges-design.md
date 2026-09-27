# Notification Nudges — The Bro Needs You — Design Spec

**Date:** 2026-09-26
**Status:** ✅ Shipped — implemented as reviewed (`src/nudges.js` + store field + CFG section + tick hook; 26 new tests). Two build deviations, both caught by the suite: **(1)** quiet hours are applied **inside the evaluator** (it already receives `nowHour`, and the exemption column is per-condition — the shell owning the gate would have duplicated the table's knowledge); **(2)** the tick interval gained a `__broTick.stop()` test handle and all ten UI suites call it in teardown — the nudges suite caught the real cross-test leak of prior instances' tickers firing into a fresh jsdom environment (the `__broBootOverlay` discipline, now applied to the tick). **v3.4.1:** the two-day body soak caught the `walk` key living for a whole session (nothing cleared it on the lane's rollover) — fixed by scoping the key to the lane's date (`walk:<date>`, delivered via the event's `key`/`tag`) and handing the shell the stale keys through the existing `clear` contract; the shipped "once per day (re-arms at rollover)" row now holds as specified, with one new regression test in `nudges.test.js`.
**Program:** v3.4.0 "the body release" — front 3 of three (1: pedometer IRL quests ✅ → 2: dream-on-return ✅ → 3: notification nudges ✅).

## Motivation

The app is installed and offline-capable but *silent* — the PWA shell shipped in the 3.x line and the service worker prunes its caches on every deploy, yet nothing ever reaches past the tab. A tamagotchi that only exists while you look at it is a website. The care loop needs a doorbell: hunger critical, a petition about to expire unanswered, the walk unfinished as evening comes. And the fiction already knows it — J.O.O.H. watches the pedometers; the least the bro can do is watch back.

## Lineage note (honest)

2.0 had no notifications — like the dream cycle, this is original 3.x work, not a restoration. What it builds on is all shipped:

- The **mood thresholds** the nudges fire on are the shell's own, already rendered: hunger < 25 → STARVING, energy < 20 → DRAINED, happy < 25 → the sad face. Nudges restate what the vitals panel already decided, never invent a condition.
- The **`bgmMuted` toggle** is the opt-in persistence pattern (boolean field, heal line, `set…` mutator) — nudges copy it exactly.
- The **petition desk's `expiresAt`** is the only deadline in the sim; the expiry nudge reads the same field `expirePetition()` does, so a nudge and a withdrawal can never disagree.
- The **CI-isolated jsdom suites** are the proof harness; `Notification` gets stubbed the way `DeviceMotionEvent` was for the pedometer.
- **Delivery is page-context `new Notification()`** — a correction to this spec's first draft, which claimed the service worker was "the delivery vehicle." It isn't and needn't be: `Notification` is available to the page itself whenever the permission is granted, SW or not. `src/sw.js` stays untouched; no push handler, no `shownotification`, no SW changes in this feature.

## The mechanic in one breath

The player opts in from SYSTEM.CFG; a permission gate asks the browser once; from then on the shell's existing 1s tick evaluates a small list of conditions — each with its own debounce — and shows a system notification in Ryan's voice when one fires. Conditions are quiet-hours aware, never repeat while already visible, and never fire while the tab is focused (you're here; the bro can see you).

## Goals

- **Opt-in and revocable twice over.** The in-app toggle persists like `bgmMuted`; the browser's own permission is the second gate. Either being off silences everything.
- **Zero new clocks.** Nudges evaluate inside the existing 1s `tick()` consumer in `main.js` — no timers, no workers, no polling loop of their own. The shell already breathes once a second; this rides the breath.
- **Thresholds are the shell's, not new ones.** A nudge condition must reference a mood/vital/quest state that the UI already renders somewhere. If the panel wouldn't show it, the nudge doesn't send it.
- **Debounced, not spammy.** Every condition has a per-condition cooldown (hours, not seconds) and a re-arm rule ("only after the state has been true→false→true again," not "every hour while starving").
- **Quiet hours respected.** A default 22:00–08:00 window silences everything except the petition-expiry nudge (a 48h ask dying at midnight is exactly the thing you'd want to know about). Declared consequence: the `walk` nudge (fires ≥ 18:00) dies at 22:00 — a 4h evening window; nudges silenced by quiet hours are **not** retroactively queued (the doorbell doesn't ring at 08:00 for last night's hunger), and their debounce re-arm rules handle the next episode naturally.
- **Never while focused.** `document.hasFocus()` is true → skip, and a focus-skip consumes no cooldown (the nudge fires on the first qualifying tick after focus leaves). The moment you tab away, the doorbell arms again.

## Non-Goals (YAGNI)

- No push server, no VAPID keys, no backend — everything is local; notifications fire only while the shell is running (open in a background tab counts; fully closed does not, and that's honest for a sim that lives in its tick loop).
- No per-condition toggles — one switch, five conditions, fixed. Per-condition settings is a settings page, not a nudge.
- No notification *actions* (buttons in the notification) — click focuses the app; that's the whole interaction.
- No rich notification payloads, images, or badges — title + body in Ryan's voice, that's it.
- No nudge history/log — SYS.LOG already records every send (`[NUDGE]` tag); the log is the history.
- No iOS-specific PWA-install nagging.

## Data model

One new save field, healed by the existing normalize pass (the `bgmMuted` pattern):

```js
nudges: {
  enabled: false,        // the in-app opt-in — the only part that persists
  quietStart: 22,        // hour of day — fixed in v3.4, fields exist for 3.5 configurability
  quietEnd: 8,
}
```

- **`lastSent` is runtime-only and lives outside the save** — a module-scoped map in `src/nudges.js`, not a field of the saved object (the first draft put it inside `nudges` and declared it unpersisted — a contradiction a reviewer would reject, and a real hazard: `save()` serializes whole state, so an in-object map would ship timestamps into every export and save code). Cooldowns are "not twice in an hour of *running*"; a save that sat closed for a week has no stale debt, and exports stay clean.
- No new save-field *content* beyond `enabled` + quiet hours — the conditions read state that already exists.

## The five conditions

Evaluated in order on each tick (when `enabled && !document.hasFocus()`); first match wins — one nudge per tick, never a volley:

| # | Key | Condition (all existing state) | Title | Body (Ryan's voice) | Debounce | Exempt from quiet hours |
|---|-----|-------------------------------|-------|---------------------|----------|------------------------|
| 1 | `petition` | `petitions.live` exists and `expiresAt − now < 12h` | `📜 Your bro is waiting` | `"He asked: <request>. The desk closes in <Nh>."` | once per live petition | **yes** |
| 2 | `hunger` | `stats.hunger < 25` (the STARVING line) | `🥺 Ryan is starving` | `"The machine hungers. A pizza is two clicks away."` | 6h, re-arms when hunger ≥ 25 | no |
| 3 | `energy` | `stats.energy < 20 && !sleeping` (DRAINED, and not already resting) | `😪 Ryan is drained` | `"The rig hums. REST is right there."` | 6h, re-arms on energy ≥ 20 or sleeping | no |
| 4 | `happy` | `stats.happy < 25` (the sad face) | `😢 Ryan is lonely` | `"Nobody has pet the bro in a while. Just saying."` | 6h, re-arms on happy ≥ 25 | no |
| 5 | `walk` | `pedometer.enabled && !pedometer.today.rewarded && goal − today.steps ≥ 200` and local hour ≥ 18 | `👟 The walk is undone` | `"<N> steps short of the quest. The evening is young."` | once per day (re-arms at rollover) | no |

Debounce mechanics: the runtime `lastSent` map gates sends; the re-arm rule has the evaluator return `clear: [key]` when a debounced condition has gone false (the caller applies it), so a second crisis *episode* gets its own nudge. `petition`'s key is the petition's `id`, not a fixed key — a new ask is a new nudge, and granting/denying/expiring the ask ends that key forever.

**Starvation repeat-honesty (declared):** hunger decays ~1 point per few minutes at rest, so the 6h debounce means a starving bro gets roughly one nudge per episode even if you ignore him for a day — the re-arm needs the condition to actually clear. That's the chosen behavior: nudges are a doorbell, not an alarm clock; the vitals panel is the alarm. If playtesting says otherwise, the debounce drops to 2h — a one-constant change.

## The mechanics module — `src/nudges.js` + the store seam

- **`src/nudges.js`** (the `petitions.js` precedent — pure module, importable without a window): the CONDITIONS table and **`evaluateNudges(state, lastSent, nowHour) → { event, clear } | null`** — genuinely pure: reads state + the runtime `lastSent` map *as arguments*, returns either null or `{ event: { key, title, body, tag }, clear: [keys…] }` (re-arm notices for debounced conditions that have gone false), **mutates nothing** (the first draft called a `lastSent`-mutating function "pure" — a reviewer would reject that; purity here is load-bearing, it's what makes the debounce table testable under node with no jsdom and no fake timers). The shell applies `clear` to its `lastSent` map and, when `event` is present and the focus/quiet gates pass, sends it and stamps `lastSent[event.key]`.
- **`state.js`**: the `nudges` field + heal (`enabled` coerced, unknown shapes dropped) + `setNudgesEnabled(on)` mirroring `setBgmMuted`.
- **`main.js`** owns the runtime `lastSent` map and the tick hook: right after `store.tick(1)` — `const ev = evaluateNudges(state(), lastSent, new Date().getHours()); if (ev && !quietBlocked(ev)) { send(ev); lastSent[ev.key] = Date.now(); }`. The shell asks the store's state on its own cadence — the inverse of the pedometer's seam, no deferred-event machinery.
- The `document.hasFocus()` gate lives in the shell hook too (DOM reads stay out of the pure evaluator). jsdom truth: `hasFocus()` returns **false** by default, so tests get sends without stubbing; the skip rule is `hasFocus() === true → skip` — only a *proven* focused tab silences the doorbell.
- **Focus-skips don't consume cooldowns**: `lastSent` is stamped only on actual sends. A user who returns, fixes nothing, and leaves again within the debounce window gets one nudge per episode, not one per focus-toggle.

## The shell half — `main.js`

- **SYSTEM.CFG — NUDGES section** (below STEP.SYNC): status line (`OFF · ON · BLOCKED — browser denied`), one toggle button. The click requests `Notification.requestPermission()` (promise form; the gesture rule from the pedometer applies verbatim), persists `enabled` only on `granted`, and renders BLOCKED on `denied`.
- **Send path:** on a non-null evaluation that passes the focus + quiet-hours gates — `new Notification(title, { body, tag: key })`; `tag` collapses duplicates (a visible starvation nudge is not re-stacked by the OS). Log `[NUDGE] <key> — <title>`, then `lastSent[key] = now`.
- **Click:** `notification.onclick = () => { window.focus(); notification.close(); }`.
- **Quiet hours** are checked in the shell hook (they need the wall clock, which the evaluator receives as `nowHour` and applies per the table's exemption column) — `hour >= quietStart || hour < quietEnd` → skip all but `petition` (its exemption is the desk's deadline, not a mood).
- **Feature check:** `!('Notification' in window)` → the toggle renders BLOCKED with "unsupported here" and the save stays disabled. jsdom truth, handled once.
- **Voice convention (declared):** titles are the shell's telemetry voice ("Ryan is starving" — what the vitals panel would say); bodies are Ryan quoting himself ("The machine hungers..."). The mix is deliberate: the notification tray is the shell speaking about him, the body is him speaking through it.

## Persistence & interop (free rides)

- **Save:** one flat field riding the codec, soul export, and EXPORT FOR BRIDGE unchanged.
- **Bridge:** nothing — KlunkDunker's posts are composed by Gemini from the soul; a browser notification channel is the shell's business, not his. The spec's one deliberate bridge *non*-line.
- **MOLT JOURNAL / diary:** nothing — a nudge is an ask, not an event in Ryan's life; the memory engine stays clean of doorbell noise. (The petition-expiry *withdrawal* already writes its own diary line via the existing expiry path.)
- **Pedometer/dream cycle:** the `walk` nudge reads `pedometer` read-only; the dream overlay and nudges can coincide (boot after absence with starving stats) without knowing about each other — the overlay takes the foreground, nudges skip while `document.hasFocus()` during the read anyway.

## Testing plan

- **Pure unit (`tests/nudges.test.js`, node — no jsdom needed, proving the evaluator's DOM-independence):**
  - Each condition fires exactly under its trigger (boundary values: 24/25 hunger, 19/20 energy, 24/25 happy, 200/201 steps-short) and returns null otherwise.
  - Priority: two crises at once → the first row wins; no volley.
  - Debounce: second call inside the window → null; re-arm (state false→true, via the returned `clear` list applied by the caller) → fires again.
  - Quiet hours: `nowHour 23` fires nothing except `petition`; `nowHour 12` fires all; the `petition` nudge at 23:00 still fires.
  - Purity by construction: the evaluator runs under plain node (no window in scope at all) and mutates neither state nor `lastSent`.
  - Walk boundary: `goal − steps = 200` fires, `199` doesn't; before 18:00 never fires; the lane's cap means a *completed* quest never fires even though `rewarded` alone would also gate it.
- **Shell integration (`tests/nudges.ui.test.js`, jsdom real shell):**
  - CFG section renders OFF + toggle; click with `Notification` stubbed-granted → ON, save persisted.
  - Stubbed-denied → BLOCKED, save stays off.
  - No `Notification` in window → BLOCKED (jsdom truth).
  - Seed starving stats (jsdom's `hasFocus()` is false by default — no stub needed for sends): the tick consumer sends via the stub, `[NUDGE]` line in SYS.LOG, second tick sends nothing (debounce).
  - `hasFocus` stubbed **true** → no send, and `lastSent` untouched (focus-skips don't consume cooldowns).
  - Quiet hours at the shell layer: seed the walker's condition at a faked evening hour → sends; same state with quiet hours active (non-petition condition) → no send.
  - Console-silent throughout (the suite-wide bar).
- **Shell integration (`tests/nudges.ui.test.js`, jsdom real shell):**
  - CFG section renders OFF + toggle; click with `Notification` stubbed-granted → ON, save persisted.
  - Stubbed-denied → BLOCKED, save stays off.
  - No `Notification` in window → BLOCKED (jsdom truth).
  - Seed starving stats with `document.hasFocus` stubbed false → the tick consumer sends via the stub, `[NUDGE]` line in SYS.LOG, second tick sends nothing (debounce).
  - Focused tab → no send.
  - Console-silent throughout (the suite-wide bar).

## Rollout

1. `src/nudges.js`: CONDITIONS table + pure `evaluateNudges`.
2. `state.js`: `nudges` field + heal + `setNudgesEnabled`.
3. `main.js`: CFG section, permission flow, tick hook (evaluator call + gates + send), runtime `lastSent` map.
4. Tests: the two suites above (~15 cases), badge bump in the same commit, dist rebuild.
5. Live-verify in the preview: stub-grant the permission via `preview_evaluate`, seed starving stats, confirm the send + `[NUDGE]` log with `hasFocus()` false; stub it true and confirm silence.

**Estimate:** the smallest front of the three — one pure function, one permission gesture, one send line, no new stores of data. Every threshold is borrowed, every pattern (toggle persistence, gesture-gated permission, stubbed API in CI) already exists in the codebase from the pedometer build.
