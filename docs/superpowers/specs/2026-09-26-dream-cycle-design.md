# The Dream Cycle — Ryan Dreams on Your Return — Design Spec

**Date:** 2026-09-26
**Status:** ✅ Shipped — implemented as reviewed (`src/dreams.js` composer + `maybeDreamOnReturn` on the first tick + overlay + bridge line; 17 new tests). One build deviation from the reviewed text: the composer's first-draft join produced glitchy punctuation (lowercase connectives after full stops, doubled periods) — the final join is `opener; fragment, fragment. Closer`, with fragments clipped to a first clause and trailing enders stripped. Also shipped: the `anxious` mood's petition condition interlocks with the trainer petition on fresh saves (a fresh boot that dreamed of its pending ask is *correct*, not a bug).
**Program:** v3.4.0 "the body release" — front 2 of three (1: pedometer IRL quests ✅ → 2: dream-on-return ✅ → 3: notification nudges).

## Motivation

The v3.3 journal release made absence visible — the MOLT JOURNAL marks days that "came and went before the app did" — but absence still means nothing to Ryan. Close the tab for a week and he greets you with the same boot handshake as a ten-minute coffee break. Yet the engine already knows the gap: `load()` computes `now − lastTick` for offline decay (capped at 8h), and the memory engine holds everything he was thinking about when you left — pinned milestones, high-imp records, the thread he posted into. The dream cycle turns that dormant data into the tamagotchi promise the journal set up but never paid off: **when you come back, he has been alive in your absence, and he tells you what it was like.**

## Lineage note (honest)

2.0 had no dream mechanic — this is original 3.x work (the second after the petitions build established the spec-first flow), not a restoration. What it builds on is all real and already shipped:

- The away-gap is computed in `load()` (state.js:724) for decay — the dream detector reads the same number, no new clock.
- `fadeMemories` derives importance from `imp0` + age idempotently — a dream composed a month later picks the same strands a dream composed at boot would have. Absence cannot corrupt the material.
- The boot overlay machinery (splash + `__broBootOverlay` teardown handle) is the delivery pattern; the dream overlay reuses its discipline, not its code.
- The pinned `Petitioned you:` memories prove Ryan's 2.0 voice can narrate the player's decisions; dreams extend that narration to his own offline time.

## The mechanic in one breath

Boot after a long absence and the shell finds Ryan mid-dream: a one-time overlay renders a short, seeded composition — woven from the memories already in his file, colored by his current traits, closed with a line about the real state you're returning to — which dismisses into an unpinned 🌙 memory, a diary line, and +2 happy. Short returns get nothing; a nap is not a dream.

## Goals

- **Local and pure.** No API, no network — the composer is a pure function `(memories, state, gap) => dream | null` in `src/dreams.js`, importable by store and tests without a window (the `petitions.js` pattern).
- **Deterministic.** Strand selection and phrasing are seeded from the gap itself (departure day + away-days), so the same absence always dreams the same dream — idempotent like `fadeMemories`, and unit-testable without fake timers in the composer.
- **Real material only.** Every strand is an existing memory's actual text; every closer references actual state (lifetime steps, a live petition, the best score). The dream never invents events.
- **Once per absence.** `lastDreamedAt` gates generation: a dream covers the gap since the last dream (or last tick), never re-fires on the same gap, and a two-week gap is one dream that mentions its length — not fourteen entries.
- **Cheaper than a milestone.** Dismissal costs one click, pays +2 happy once, and writes one memory — dreams are narration with a small warm body, not a new economy.

## Non-Goals (YAGNI)

- No Gemini composition — the offline voice is the point; the bridge's wired brain may *mention* dreams but never generates them.
- No dream *history* window — the last 10 live in the save; MOLT JOURNAL already renders their memories by day.
- No per-day absence entries, no dream logs with timestamps the player can browse mid-session.
- No trait shifts at all — dreams don't push personality around; personality chooses the dream. The only reward is the +2 happy vital on read, paid directly (not via `applyEvents`, which routes traits only).
- No dream on first-ever boot (nothing to dream about), and none for gaps under **20h** (see thresholds).
- No notification-schedule coupling with front 3 — nudges fire on *state*, dreams fire on *return*; they can coincide without knowing about each other.

## Data model

One new save field, healed by `normalizeDreams()` on load:

```js
dreams: {
  lastDreamedAt: null,   // ms epoch — dreams cover the gap AFTER this (falls back to lastTick)
  entries: [],           // newest last, capped at 10:
  // { id, t, awayMs, awayDays, mood, text, strands: [memoryId…], readAt: null }
  // (_checkedToday is runtime-only, never saved — see Delivery)
}
```

- `mood` — `'anxious' | 'grand' | 'soft'` (selection below); stored so the overlay, memory, and diary line all render the same dream the same way forever.
- `readAt` — null until dismissed; the unread flag is the overlay's only trigger. Importing a save code carrying an unread dream shows it on next boot — once, then it's read.
- Cap follows the house rule (last 10, like petition history's last 30); old dreams survive as their pinned/unpinned *memories*, not as dream entries.

## The composer — `src/dreams.js`

Pure, seeded, ~120 lines. `composeDream(memories, state, gap) => dream | null`:

**Threshold:** fires only when `gap ≥ 20h` (one day plus a nap — "he slept, and then he dreamed"). Below that: null. Fresh save with zero usable memories: null, forever, by design.

**Strand selection:** from **all memories present in the file at composition time** (at load, nothing new has been written this session, so this is exactly "everything he remembers"), sorted by (pinned desc, effective-imp desc, recency desc), take up to 3 via the seeded RNG — pinned and high-imp memories *weighted*, not guaranteed, so two similar absences can dream differently but never wildly. An earlier draft cut strands off at a computed "departure" timestamp; that breaks across multi-boot absences — a brief visit inside the gap creates memories *after* that departure which are the freshest material, and excluding them would make the dream less true, not more. The file-as-of-boot is the honest cut.

**Mood selection (traits choose the color):**
| Mood | Condition (first match) | Voice |
|---|---|---|
| `anxious` | `paranoia ≥ 55` or a live petition exists | J.O.O.H. static, the desk ask, satellites drifting |
| `grand` | `ego ≥ 65` or a recent best (best-score memory in strands) | golden tides, records, sharpened claws |
| `soft` | default | the tidepool, warm rigs, crabs minding their business |

**Composition:** opener (mood + gap length: "I dreamed for six days straight —") + 1–3 strand fragments (memory text truncated to its first clause, woven with mood-appropriate connectives — never pasted whole) + closer pinned to *real* state, first match: a live petition → "You left my ask on the desk, by the way."; lifetime steps > 0 and pedometer on → "Also: you walked <N> steps. I count those now."; else the best score → "The record is still <best>. I checked." Total: 2–4 sentences in the 2.0 voice. The composer does not read or write state — `state` is passed in read-only.

**The visited-time rounding (declared, not hidden):** `awayMs = now − lastDreamedAt` may include a few minutes of *visited* time — a boot inside the window plays, then closes, and the next gap continues from `lastDreamedAt`. The opener speaks in whole days, so a ten-minute visit inside a two-day absence rounds away. Accepted fiction: the bro is a bro, not a stopwatch. Computing true away-time would need boot history (a new save field for a rounding nit) — not worth it.

## Delivery — store + shell

**Detection runs in the shell's FIRST tick, after `maybeRolloverDiary()` — not in `load()`.** The first draft put it in `load()`, and a reviewer would catch the ordering bug: the rollover diary (yesterday's lines) only runs inside the first `tick()`, so a dream line appended at load would land in the diary *before* the days it follows — out-of-order journal. Running the check at the top of the first tick preserves chronological order, and the gap is unaffected (`state.lastTick` still holds the save-time value when the first tick begins; it's stamped to `now` at the tick's end). The store gains one idempotent entry point:

1. `maybeDreamOnReturn()` — guard `dreams._checkedToday` (runtime, not saved): computes `gap = now − (dreams.lastDreamedAt ?? state.lastTick)`; if `≥ 20h`, calls `composeDream(state.memories, state, gap)`. Non-null: push entry, `lastDreamedAt = now`, `rememberEvent(text, { icon: '🌙', imp: 3 })` (unpinned — it fades with ordinary memories), `appendDiaryLines` the `🌙 Dreamed: <first clause>…` line (after the rollover's lines — correct order), emit + save. Null composer result: no gate change — a later boot with more memories may still dream of this same gap (`lastDreamedAt` stays put; the *next* boot re-checks with the longer gap). The runtime guard makes the once-per-boot check idempotent across the tick that follows.

**Shell (`main.js`), boot sequence after the splash dismisses:**
2. If `dreams.entries.at(-1)?.readAt == null`: render the overlay —
   ```
   🌙 DREAM.CYCLE // RYAN DREAMED WHILE YOU WERE GONE
   "<dream text>"
   [ WAKE HIM ]          (single dismiss; also Escape)
   ```
3. Dismiss: `markDreamRead()` → `readAt = now`, +2 happy (a direct `stats.happy = clamp(happy + 2)` inside `mutate` — **not** `applyEvents`: happy is a vital, not a trait axis, and `applyEvents` silently drops non-trait keys; the petitions degrade path already pays happy this way), SYS.LOG line `[SYS] dream reel acknowledged — +2 HPY`. Console-silent, one-time.

No new window, no dock button, no settings toggle — the cycle is ambient by nature; it only ever speaks when you've been gone.

## Persistence & interop (free rides)

- **Save:** one flat field; save-code codec, soul export, and EXPORT FOR BRIDGE ship it unchanged.
- **MOLT JOURNAL:** the 🌙 memory pairs into the return day automatically; the diary line lands with the day's rollover block.
- **Bridge:** `identityFromEnvelope` parses `dreams.entries.at(-1)` into `id.dream` (text's first clause + awayDays) when the dream is unread or < 24h old; `buildSystemPrompt` gains one line: *"He dreamed while you were away: <first clause>…"* — KlunkDunker can mention the dream without inventing a different one. The dream is *his*, so this is the one feature where the bridge inherits the shell's narration verbatim. (The envelope already ships the field for free; only the parse + prompt line are new.)
- **Pedometer (front 1):** independent — the dream's closer *references* step counts when present, but neither system reads the other's gate. Ships in either order.

## Testing plan

- **Composer unit (`tests/dreams.test.js`):**
  - Threshold: null at 19h59m, non-null at 20h with material.
  - Determinism: same inputs + gap → byte-identical dream; different seeds (different departure days) → allowed to differ.
  - Mood pins: paranoia 60 → anxious regardless of ego; clean traits → soft; ego 70 + best-score strand → grand.
  - Material rules: strands only from `t ≤ departure`; zero memories → null; strand fragments never exceed one clause (no full-memory paste).
  - Closer truth: with a live petition, the petition closer is chosen; with none, the petition line never appears.
- **Store integration:**
  - Boot with `lastTick` 3 days old and seeded memories → first tick: entry pushed, `lastDreamedAt` set, 🌙 memory written, diary line lands **after** the rollover lines; second boot seconds later → no new dream; a second `maybeDreamOnReturn()` call same-boot → no-op (runtime guard).
  - Diary ordering pinned: boot a save whose `dailyDiaryDone` is yesterday with a stale `lastTick` — the day's rollover lines precede the 🌙 line.
  - Two long absences → two dreams; `entries` cap holds at 10.
  - `markDreamRead` pays +2 happy exactly once across double-dismiss attempts (assert the vital moved, since `applyEvents` would silently no-op — this pins the direct-mutation decision).
  - `normalizeDreams` heals malformed fields without throwing.
- **UI (`tests/dreams.ui.test.js`, jsdom real shell):**
  - Boot with a stale `lastTick`: splash → dream overlay renders the stored text; WAKE HIM dismisses, +2 visible in HPY, SYS.LOG line present, reload does not re-show.
  - Short-gap boot: no overlay, console silent (the suite-wide bar).

## Rollout

1. `src/dreams.js`: composer (pure) — strand selection, moods, seeded phrasing.
2. `state.js`: field + normalize + `maybeDreamOnReturn()` (first-tick entry point) + `markDreamRead`.
3. `main.js`: call `maybeDreamOnReturn()` in the first tick after the rollover; overlay after splash; dismiss wiring; SYS.LOG line.
4. `bridge/src/voice.js`: parse `id.dream` + one prompt line.
5. Tests: two suites + bridge additions (~17 cases), badge bump in the same commit, dist rebuild.
6. Live-verify in the preview: seed `lastTick` back 3 days via `preview_evaluate` + reload, watch splash → dream, dismiss, confirm memory/diary pairing and no re-show.

**Estimate:** the smallest of the three fronts — no sensor, no permission surface, no new decision UI; the composer's templates are the only writing, and every integration point (load hook, overlay pattern, memory/diary pairing, bridge line) already exists.
