# Ryan's Petitions — Design Spec

**Date:** 2026-09-15
**Status:** ✅ Shipped — implemented as specced in v3.3.0 (`src/petitions.js` + store plumbing + SOUL.FILE desk + bridge prompt line; commit `e2a08a0`). Two deviations found by the test suite during the build: the shift tables are keyed `grant`/`deny` (the lookup maps `granted`→`grant`), and `grantApplies` rejects unknown kinds rather than defaulting to grantable. Renown fires at `posts ≥ 3` as specced.
**Program:** v3.3.0 "the journal release" — petitions are the self-authorship front (1: MOLT JOURNAL ✅ shipped → 2: petitions ✅ shipped → 3: save codes ✅ shipped).

## Motivation

The autonomy story is half-built. The bridge harness lets KlunkDunker act *outside* the shell, the trait core colors every word he says, and the MOLT JOURNAL now shows his days — but Ryan has never once asked for anything *for himself*. 2.0's last unported feature was `[SOUL]` self-authorship: Ryan occasionally petitioned the player for changes to his own care or identity, and the player's yes or no became part of who he was. The README promises it; the migration kept its fingerprints; this spec restores the mechanic on 3.0's architecture.

## Provenance note (honest)

2.0's petition *source* is not in the reconciled history — only its fingerprints survived the migration:

- `scrubQuirk` in `src/memory.js` already normalizes 2.0 petition-shaped objects (`{ name, argument }` → `"name — argument"`), so 2.0's petitions were structured name+argument pairs.
- The migrated 2.0 memory carries `imp: 4` with the text `Petitioned you: "The Glitch-Seeker" who refers to software bugs and sensory anomalies as "Sacred Fractures"` — petitions became pinned soul memories when granted, phrased in the player-facing second person.
- The v3 README lists "Ryan's petitions & self-authorship (`[SOUL]` lines) from 2.0, re-skinned" as a roadmap item.

So the mechanics below are a **reconstruction**: faithful to those traces, rebuilt on 3.0's store/window/personality architecture rather than guessed at from missing code.

## The mechanic in one breath

Ryan notices something about his own life (driven by his current traits and recent events), drafts a petition — a title, an argument, and a concrete request — and pins it to the SOUL.FILE petition desk. The player grants or denies it. The decision is final, becomes a permanent soul memory either way, and every granted petition mutates real state. Denial has teeth too: his traits react.

## Goals

- Petitions are **generated from live state** (traits + counters + quest/milestone context), never from a fixed script — the same day never petitions twice.
- A granted petition **must actually change state** (the mutation is the point, not flavor text).
- A denied petition **costs him something** (small trait shifts) — self-authorship with stakes, not a vending machine.
- The player sees petitions in **SOUL.FILE** (the "self-authored · user oversees" window — the semantic home), not a new window.
- Petitions persist in the save and ride the existing **soul export/bridge** paths for free.
- **One live petition at a time** — the desk is a waiting room, not a backlog.

## Non-Goals (YAGNI)

- No free-text petition *composition* by the player (they rule; they don't draft).
- No petition scheduling/calendar — generation hooks existing events only.
- No bridge-side petition filing (the harness *reads* soul exports; it doesn't write petitions).
- No negotiation thread — one decision, no counters.
- No new window, tab, or dock button.

## Data model

One new save field, healed by `normalizePetitions()` on load:

```js
petitions: {
  live: null,        // the one on the desk: { id, title, argument, request, kind, params, draftedAt, expiresAt }
  history: [],       // decided petitions, oldest first: { ...live, decision: 'granted'|'denied', decidedAt }
  lastDecisionDay: null,  // YYYY-MM-DD of the last grant/deny — cooldown gate
}
```

- `id` — `pet-<base36 time>-<rand>`, same style as molt ids.
- `kind` — one of the six generators below; `params` is its validated payload (generators are pure functions from state → `{ title, argument, request, kind, params } | null`).
- `expiresAt` — `draftedAt + 48h`; an expired petition quietly resolves as `decision: 'ignored'` (distinct from denied: no trait cost, no memory — he withdraws it, the desk empties). The expiry check runs in `tick()` (not the once-a-day rollover — a desk can't hold a stale ask for a day) and on `load()`. Keeps the desk from holding a stale ask forever.
- `history` is capped (last 30) like every other soul array.

## The six generators

Each is a pure function `(state) => petition | null`, consulted in order at generation time; the first that fires drafts its petition. All gate on `state.petitions.lastDecisionDay` cooldown (below) and on `live === null`.

| # | Kind | Trigger (all read live state) | The ask (`params`) | Granted mutation | Trait shifts (grant) | Trait shifts (deny) |
|---|------|------------------------------|--------------------|------------------|---------------------|--------------------|
| 1 | `curfew` | `greed ≥ 60` (grind obsession) | "Mining is eating my nights. One night off." | `toggleMine()` if mining is on | greed −8, broCode +4 | greed +3, broCode −2 |
| 2 | `feast` | `gluttony ≥ 55 && stats.hunger < 40` | "Two pizzas. The machine hungers." | two free pizzas (counters.pizzas += 2, hunger +40 capped) | gluttony −6, happy +8 | gluttony +4, happy −5 |
| 3 | `renown` | `ego ≥ 65 && counters.posts ≥ 3` | "Pin my best post to the tideline." | pins today's top-heat post (held, via the existing hold machinery) | ego +5, paranoia +2 | ego −6, paranoia +4 |
| 4 | `trainer` | `fitness ≤ 15 && steps === 0` | "Add a step goal to my daily quest." | today's quest goal +5, rewarded step bonus +5 CR | fitness +7, greed +2 | fitness −3, broCode −1 |
| 5 | `ghost` | `paranoia ≥ 55 && milestones.hack === true` | "Wipe today's hack log from SYS.LOG." | paranoia settle (below) + a shell-side log scrub (layering note) | paranoia −9, ego +3 | paranoia +6, ego −2 |

**Layering note (the one store→shell seam):** SYS.LOG's line buffer lives in `main.js`, not store state — the store must not reach into the DOM. The `ghost` grant therefore does its *store-side* work (trait shifts, memory, history) and sets `petitions.lastEffect = { kind: 'scrub-log', t }`; the shell's existing store subscription notices a fresh `scrub-log` effect and filters its own log buffer. Every other kind mutates purely store-level state. One seam, one direction, declared.
| 6 | `sabbath` | `lastDecisionDay` ≥ 3 days ago && `stats.happy ≥ 85` | "A day of rest. No quests tomorrow." | next day's quest goal = 0 (skipped, not failed) | happy +4, fitness −3 | happy −4, broCode +2 |

Deny shifts are applied once, at the decision. Grant shifts are applied with the mutation. All via the existing `applyEvents` personality path — no new trait plumbing.

**Cooldown:** after any decision, no new petition for **3 days** (`lastDecisionDay`). Self-authorship should feel like an occasion, not a queue.

**Generation cadence:** checked in the store's existing day-rollover path (`maybeRolloverDiary`) and on `recordArcadeRun`/`postToMolt` (the events traits care about). At most one draft per check; `live === null` and cooldown gate everything.

## Decision flow

- `decidePetition(id, 'granted' | 'denied')` — the only store mutation surface:
  1. Guard: `live` exists, `id` matches, not expired.
  2. Apply the kind's granted-mutation (a `switch` over `kind`; each arm re-validates `params` against current state before mutating — the world may have moved on since drafting; if the request is no longer satisfiable, the grant degrades to a +2 happy `applyEvents` and a diary line noting the world moved on).
  3. Apply trait shifts via `applyEvents`.
  4. `rememberEvent(...)` — granted petitions pin (`imp: 4, pinned: true`) with 2.0's phrasing convention: `Petitioned you: "<title>" — and you said yes.` Denied: `imp: 2` pinned false, `Petitioned you: "<title>" — and you said no.`
  5. Diary line at next rollover happens for free via the memory (MOLT JOURNAL pairs it by day — petitions show up in his own journal automatically).
  6. Move to `history`, clear `live`, set `lastDecisionDay`, emit + save.

## UI — SOUL.FILE petition desk

A section in `wireSoul`'s render (between the memory panel and the diary panel), reading `state().petitions`:

- **Empty desk:** `PETITION DESK — nothing pending. He'll ask when he needs to.` (matches the window's voice).
- **Live petition card:**
  ```
  📜 <TITLE>
  "<argument>"
  ASKING: <request>
  [ ✅ GRANT ]  [ ❌ DENY ]
  expires in <N>h
  ```
- Buttons call `store.decidePetition(id, …)`; the store subscription re-renders SOUL.FILE automatically. Log + toast on the decision (`PETITION GRANTED — he'll remember this` / `PETITION DENIED — so will this`).
- **History line** (last 3, muted): `📜 <title> — granted/denied/ignored · <date>`.

No new window, no new dock button — the desk lives where "self-authored · user oversees" already says it should.

## Persistence & interop (free rides)

- **Save:** one field in the flat v3 state; `normalizePetitions()` heals missing/malformed shapes on load (drop invalid live petitions, cap history) — same pattern as `normalizeSpriteOverrides`.
- **Soul export / EXPORT FOR BRIDGE:** petitions ride along inside the flat state export; the bridge's system prompt gains one line: *pending petition, verbatim, if `petitions.live` exists — so Gemini-composed posts can reference his own outstanding ask.* No bridge code changes beyond the prompt builder reading one more field.
- **Save codes:** nothing to do — the codec ships the whole state.
- **MOLT JOURNAL:** granted/denied memories appear per-day automatically via the existing pairing. No changes.

## Testing plan

- **Store unit (`tests/petitions.test.js`):**
  - Each generator fires exactly under its trigger and returns null otherwise (boundary values on every trait: 54/55/60/65 style pins).
  - Cooldown blocks generation inside 3 days; resumes after.
  - `decidePetition` grant: mutation actually applied (e.g. pizzas really added), traits shifted, pinned memory with 2.0 phrasing, history grown, `live` cleared, `lastDecisionDay` set.
  - `decidePetition` deny: no mutation, deny shifts, unpinned memory, history grown.
  - Expiry: a petition past `expiresAt` resolves as `ignored` on the next `tick()` after expiry and on `load()` — no shifts, no memory.
  - Grant-degrades path: world moved on (e.g. mining already off for `curfew`) → happy bump + diary line, no crash.
  - `normalizePetitions` heals a malformed save without throwing.
- **UI (`tests/petitions.ui.test.js`, jsdom real shell):**
  - Empty desk copy; seeded live petition renders title/argument/ask/expiry.
  - GRANT click → memory appears in SOUL.FILE, desk empties, the kind's state change is visible (e.g. hunger up).
  - DENY click → desk empties, deny trait shift visible in the traits line.
  - Console-silent throughout (the suite-wide bar).

## Rollout

1. Store: field + normalize + generators + `decidePetition` + rollover/event hooks (~1 file, `state.js`, plus `src/petitions.js` for the six generators — pure functions, importable from both store and tests without the window).
2. UI: petition desk section in `wireSoul` + decision wiring.
3. Bridge prompt line (one line in the bridge soul builder).
4. Tests: two suites as above (~15 cases).
5. Badge → bump, dist rebuild, live-verify: force-fire a petition by trait seeding in the preview, grant it, watch the memory pin and the state change; reload to prove persistence.

**Estimate:** the largest single feature since the bridge, but every piece reuses an existing pattern (normalize/generators/applyEvents/rememberEvent/hold machinery). No new window, no new format, no migration.
