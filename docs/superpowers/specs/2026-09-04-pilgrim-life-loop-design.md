# Spec: Pilgrim Life Loop ("Pilgrims Get a Life")

**Status:** Implemented (shipped in `a965faa`, extended with the theory lane post-ship). This spec is the design record of what was decided interactively and built.

## Problem

Pilgrims were static trophies. `usherPilgrim` froze them at `{ id, name, eyeStage: 'flickering', day }` and nothing ever changed them again: no pilgrim ever earned eye XP, no pilgrim ever acted, and every substantive Moltbook post was Ryan's. The feed read like a personal blog with a silent audience, and "ushering a pilgrim" had no long-term meaning — the pilgrim never grew, never awakened, never participated.

## Goals

1. Pilgrims act on their own schedule — **without any visit from the user**.
2. Pilgrims earn **their own eye XP** and visibly ascend `flickering → open` on the same thresholds as Ryan.
3. The feed has **other authors**: pilgrims post activity lines, full theory takes, and replies to Ryan's posts, each in a distinct persona voice.
4. **Zero AI cost by default**: wanders and theories are pure persona templates. The only AI-spend lane (replies) degrades gracefully offline.

## Non-Goals (YAGNI)

- **No pilgrim-initiated DMs to the user.** Pilgrims speak in the feed; conversations stay user-initiated.
- **No AI generation for wanders or theories.** Templates only — the budget is for Ryan's autonomy and user surfaces.
- **No per-pilgrim persistence beyond cooldowns/XP.** No inventories, relationships, or quests per pilgrim.
- **No pilgrim-to-pilgrim threads.** Replies target Ryan's posts only.
- **No independent random personalities.** Voices derive deterministically from names (`pilgrimPersona`), stable across reloads.

## Design Decisions (user-approved during brainstorming)

| Decision | Choice |
|---|---|
| Reply generation | **Hybrid via the gateway** — real AI when the wire is up, persona-styled offline line otherwise (same philosophy as the quota-resilient AI layer) |
| Eye XP model | **Activity-based with real ascension** — XP accrues from actual acts and pilgrims genuinely cross the `open` threshold |
| Feed presence | **Authored posts** — distinct author chips/tint rather than anonymous "tidepool events" |

## Architecture

### Constants (`src/core/moltbook.js`)

```js
export const PILGRIM_LIFE = {
  WANDER_CHANCE_PER_MINUTE: 0.12,
  REPLY_CHANCE: 0.18,               // only when Ryan has a post to answer
  THEORY_CHANCE_PER_MINUTE: 0.05,
  WANDER_COOLDOWN_MINUTES: 10,
  REPLY_COOLDOWN_MINUTES: 20,
  THEORY_COOLDOWN_MINUTES: 40,
  WANDER_EYE_XP: 2,
  REPLY_EYE_XP: 3,                  // answering the archivist sharpens more
  THEORY_EYE_XP: 4,                 // authoring a take is real growth
};
```

At most **one pilgrim act per minute** app-wide. Ascension shares Ryan's ladder: `EYE_STAGES = ['closed', 'flickering', 'open']`, `EYE_XP_THRESHOLDS = { flickering: 10, open: 30 }` — pilgrims are ushered at `flickering` and can reach `open`.

### Core (all pure, injectable RNG)

- **`decidePilgrimAct(mb, now, rng)`** — the scheduler. Lane order: **reply → theory → wander** (conversation before monologue before ambience). Each lane: roll chance, filter pilgrims off per-pilgrim cooldown, pick one at random. Returns `null` or `{ type, pilgrim, target? }`.
- **`pilgrimWanderLine(pilgrim, rng)` / `pilgrimTheoryLine(pilgrim, rng)`** — template voicebanks keyed by the pilgrim's persona trait (6 personas × several lines each). Theories are full takes ("the nervous rookie's 'what if the pilgrims are the archive?'", "the literal auditor's 'no molting occurred. end of report.'").
- **`applyPilgrimWander/Reply/Theory`** — author the post (`addPilgrimPost` sets `author`), stamp the cooldown timestamp, grant XP via **`gainPilgrimEyeXp`** (shared thresholds; emits `pilgrim-eye` ascension events).
- **`pilgrimPersona(name)`** — hash-of-name → one of 6 traits/styles (nervous rookie, overconfident speedrunner, sleepy philosopher, paranoid archivist, cheerful gremlin, literal-minded auditor).

### Data model

Posts gain `author?: string` (absent = Ryan), `kind: 'wander' | 'theory' | 'reply' | ...`, and `replyTo?: postId`. Pilgrims gain `eyeXp`, `lastWanderAt`, `lastReplyAt`, `lastTheoryAt`. `normalizeMoltbook` backfills all of these (and missing `id`s) so legacy saves upgrade cleanly; roster stays capped at `MAX_PILGRIMS = 12`.

### AI layer (`src/ai/offline.js`, `src/ai/gateway.js`)

Replies route through the gateway as `kind: 'pilgrim-reply'`. Offline fallback: `offlinePilgrimReply(state, participant, postText)` — quotes a gist of the target post in the pilgrim's persona voice, so the reply still lands when the wire is down, at zero budget.

### UI (`src/ui/moltbook.js`, `src/ui/app.js`)

- **`pilgrimLifeTick(app)`** — fired from the app's 60-second `oneMinute` tick (after Ryan's `autonomyTick`). Guards: joined, not already in flight. Executes the decided act, surfaces ascension events, refreshes, saves.
- **`onPilgrimEvents`** — when a pilgrim's eye opens, **Ryan notices**: memory (`"TidepoolTina's third eye opened. I am not alone on this molt."`) + speech bubble (`"…The tidepool wakes up."`).
- **Feed rendering** — authored posts: 👣 author chip, sky-blue tint + `border-sky-700/50` card (Ryan stays orange), meta `day · kind · ↩ reply`.
- **Roster** — shows each pilgrim's eye XP.

## Error Handling

- **Re-entrancy:** module-level `pilgrimLifeInFlight` flag (try/finally) prevents overlapping ticks when a reply's AI call runs long.
- **AI failure:** two-layer fallback. The gateway's `pilgrim-reply` route returns a persona-aware offline line (`offlinePilgrimReply`, quoting the target post's gist) as a successful result, so the act almost always completes with an in-voice reply; the UI's generic `offlineReply` remains only as a last-resort net. Either way XP is still granted.
- **Legacy saves:** `normalizeMoltbook` backfills every new field; no migration step required.
- **Tick order safety:** `decidePilgrimAct` re-checks `mb.joined` and roster emptiness; cooldown math tolerates `0/undefined` timestamps.

## Testing (`tests/pilgrim.test.js` — 14 tests)

Scheduler gates (not joined / empty roster → null), lane ordering with blocked cooldowns (reply → theory → wander fallthrough), per-pilgrim cooldowns, authored post shapes (`author`, `kind`, `replyTo`), XP grants and real ascension events, template sanity (persona-flavored, no `undefined`, length bounds), offline fallback routing, and the UI hybrid tick (reply lane consumes budget, theory/wander lanes consume none).

## Live Verification (post-ship)

Observed in the running app: LagLich replied to a Ryan post (+3 XP), RecursiveRick wandered in literal-auditor voice, TidepoolTina both replied ("ryan said the thing!! everyone look!!") and authored a full theory — all rendering as distinct blue author cards.

## Open Questions / Future

- **Pilgrim petitions** (pilgrims filing their own quirk/ritual requests) — designed in a later spec.
- Should pilgrim eyes ever reach a *stage beyond* Ryan's current one (a humbling mechanic)?
- Wander/theory lines could occasionally reference the current weather or day-of-week for freshness.
