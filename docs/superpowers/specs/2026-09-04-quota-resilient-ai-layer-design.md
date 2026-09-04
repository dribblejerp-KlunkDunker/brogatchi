# Spec: Quota-Resilient AI Layer ("The Tide's Budget")

**Date:** 2026-09-04
**Status:** Approved design, pending implementation plan
**Project:** Bro'Gatcha (`brogatchi/`)

## Problem

Every AI surface in the app — Moltbook posts (4 call sites), Ask Ryan (1), the
Live Gaming Intel feed (2), and the JOOH tracker (1) — calls Gemini through the
local proxy. Three failure modes ruin the experience:

1. **Daily quota exhaustion.** The free Gemini key 429s once its daily quota is
   gone (often by mid-session). Every call site then degrades to a single
   canned fallback line, which repeats verbatim and ignores Ryan's soul file.
2. **No client-side reuse.** The proxy dedupes identical requests for only 10
   minutes, in memory, per server process. A restart or an hour's gap re-spends
   quota on identical requests.
3. **No self-rationing.** Ryan's autonomy loop (posts/messages on his own
   schedule) can burn the remaining quota early in the day, leaving nothing for
   the interactive features the user actually clicks.

## Goals

- Ryan **stays alive offline**: when quota is out (or budget spent, or the
  network is down), a soul-aware offline generator keeps him posting, chatting,
  and reacting in character.
- Ryan **rations himself**: a soft daily budget the gateway enforces, so he
  voluntarily switches to offline mode in character *before* the quota dies.
- **Repeated requests are free forever** (within TTL): a persistent cache rides
  the save, survives restarts, and syncs with cloud saves.
- Zero server changes; the proxy stays a dumb pipe.

## Non-Goals (YAGNI)

- No settings UI for the budget cap (constant in code; revisit if it matters).
- No semantic/fuzzy cache matching — exact-hash only.
- No streaming, token accounting, or alternate-model fallback.
- No changes to `server/proxy.mjs`, its rate limit, or its cache.

## Architecture

A single new client module, `src/ai/gateway.js`, becomes the only path to the
AI. All 8 existing `chat()` call sites switch to it. State lives on the game
save so it persists, migrates cleanly, and cloud-syncs.

```
ask({ systemInstruction, userText, history, kind, state })
  │
  ├─ 1. hash request → cache key
  ├─ 2. cache hit (fresh)?  → return cached      (free, 'recalled')
  ├─ 3. budget spent?       → offline generator  (reason: BUDGET)
  ├─ 4. rate-limited now?   → offline generator  (reason: RATE)
  ├─ 5. real chat() call
  │     ├─ ok        → spend 1, write cache, return
  │     ├─ 429       → set rateLimitedUntil (+45 min), offline (reason: RATE)
  │     └─ other err → offline (reason: NO_KEY | NETWORK | ERROR)
  └─ offline result → soul-aware generator, reason + flag on the result
```

### The gateway module (`src/ai/gateway.js`)

- **Signature:** `ask({ systemInstruction, userText, history = [], kind, state })`
  - `kind`: `'post' | 'chat' | 'intel' | 'ask' | 'jooh'` — selects the offline
    generator family.
  - `state`: the live save object (read for budget/cache/soul and written to
    record spend, cache entries, and rate-limit cooldown — see "Save
    integration").
  - Returns the same shape as `chat()` — `{ ok, text }` on success,
    `{ ok: false, code, message }` on failure — plus optional flags:
    `{ recalled: true }` (served from cache) or
    `{ offline: true, reason }` (generated locally, reason `BUDGET | RATE |
    NO_KEY | NETWORK | ERROR`).
- **Soul access:** the soul file lives at `state.moltbook.soul` (same path the
  AI context report already reads); the offline generator treats it as
  optional and falls back to neutral pools when absent.
- **Cache:** key = djb2 hash (same algorithm as the proxy) of
  `JSON.stringify({ systemInstruction, userText, history })`. Store:
  `{ text, grounded, at }` entries in an LRU capped at 40 entries, TTL 48h.
  Oldest-eviction, same cap policy as the proxy cache.
- **Budget:** the save's `aiBudget = { day, used, cap, rateLimitedUntil }`.
  `cap` = 40/day (constant). Over cap → offline before any network call.
- **Failure classification:** reuse the existing `chat()` result codes
  (`RATE`, `NO_KEY`, `NETWORK`, `ERROR`, `EMPTY`); `EMPTY` maps to offline with
  reason `ERROR`.

### Call-site migration (8 sites, one line each)

| File | Site | `kind` |
|---|---|---|
| `src/ui/moltbook.js` | autonomous post | `post` |
| `src/ui/moltbook.js` | SPEAK post | `post` |
| `src/ui/moltbook.js` | pilgrim reply | `chat` |
| `src/ui/moltbook.js` | Ryan chat opener | `chat` |
| `src/ui/app.js` | Ask Ryan modal | `ask` |
| `src/ui/intel.js` | intel feed + deep dive | `intel` |
| `src/ui/jooh.js` | JOOH tracker | `jooh` |

Each call adds `kind` and `state`; nothing else changes. `client.js` `chat()`
is re-exported unchanged for the gateway's internal use; no other module
imports `chat` directly afterward.

### Soul-aware offline generator (extends `src/ai/offline.js`)

New exports, all accepting `(state, rng = Math.random)` for testability:

- `offlineMoltbookPost(state, rng)` — 5–6 template families × 3–4 slots each
  (opener × claim × closer), drawing from:
  - the soul file: self-description, specialty, owned opinions (quoted);
  - recent memories (the top 3 by importance);
  - time of day and current stats.
  Output must read as Ryan, not as a template: varied, soul-flavored, brief.
- `offlineChatReply(state, pilgrim, lastMessage, rng)` — uses the six existing
  pilgrim personas for voice, references the last message's gist (first few
  words), and varies opener/reaction pools.
- Intel/Ask/JOOH fallbacks keep their existing behavior but gain the same soul
  flavor hooks (specialty/opinion references) where natural.
- **Safety:** every offline string passes the same sanitization as AI output —
  `[SOUL]` protocol lines can never leak into visible text (existing tests
  assert this for AI output; new tests assert it for offline output).

### Save integration

- New save-root fields: `aiCache` (array of `{ k, text, grounded, at }`, LRU
  order) and `aiBudget = { day: 'YYYY-MM-DD', used: 0, cap: 40,
  rateLimitedUntil: 0 }`. (The soul file itself already lives at
  `state.moltbook.soul` and needs no migration.)
- `normalizeState` (in `src/core/save.js`) initializes missing fields with
  defaults — old saves migrate transparently; malformed values reset to
  defaults.
- The daily rollover (existing `newDay` events path) resets `used` and `day`
  when the date changes; `rateLimitedUntil` is a timestamp and needs no reset.
- Budget spend (`used += 1`), cache writes, and `rateLimitedUntil` updates are
  made by the **gateway mutating the passed-in `state` object in place**; the
  call sites' existing save flow (the app saves after any state mutation)
  persists them. The gateway never touches storage itself. If a mutation
  throws (frozen/odd state), the gateway degrades to pass-through behavior —
  call, then canned fallback — and never breaks the UI.

## Error Handling

- **All cache/budget mutations are wrapped**: any exception falls back to
  today's behavior (real call → canned fallback). The gateway never throws.
- **Empty/offline-save edge:** if `state` or `state.moltbook?.soul` is missing
  (e.g., early boot), the offline generator falls back to neutral template
  pools rather than crashing.
- **Clock skew:** `day` is the local `YYYY-MM-DD` string (same convention the
  save's `currentDate` already uses); comparisons are string equality, immune
  to timezone drift within a device.

## Testing

Vitest, in `tests/gateway.test.js` (new) + additions to the existing
`tests/save.test.js` and `tests/offline.test.js`:

1. Cache: miss → call → hit on second identical call (no second call, free);
   TTL expiry re-calls; LRU eviction at 41 entries.
2. Budget: spend on success; no spend on cache hit or offline; rollover resets
   `used` when `day` changes; exhaustion routes to offline with `BUDGET`.
3. Rate limit: 429 sets `rateLimitedUntil = now + 45min`; subsequent calls
   within the window go offline without hitting the network.
4. Failure codes: `NO_KEY`/`NETWORK`/`ERROR`/`EMPTY` each route offline with
   the right reason; success increments budget and writes cache.
5. Offline generators: determinism with an injected rng; soul content
   (specialty/opinion/self-description) appears in output; pilgrim persona
   shapes chat replies; no `[SOUL]` substring ever appears in any generated
   string (property test across many rng seeds).
6. Save: `normalizeState` adds defaults for old saves and repairs malformed
   `aiCache`/`aiBudget`; round-trip preserves them.

A fake `chat` (vi.mock of `../src/ai/client.js`) makes the gateway fully
deterministic; no network in tests.

## Implementation Notes

- The gateway is pure client logic: no DOM, no timers of its own — everything
  is driven by the call and the state passed in, which keeps it trivially
  testable.
- The autonomy loop's existing 45-minute rate-limit cooldown and 6-act daily
  cap stay as-is; the gateway's budget is the broader safety net beneath them
  (autonomy acts are a subset of the daily budget spend).
- `cap = 40` is chosen to sit comfortably below the proxy's 30 req/min sliding
  window while leaving headroom for a day of interactive play; it is a single
  named constant.

## Open Questions

None — all decisions were made with the user during brainstorming:

- Out-of-quota behavior: Ryan stays alive offline.
- Budget: soft self-rationing cap.
- Cache: persistent, in the save, 48h TTL.
- Offline voice: soul-aware generator.
- Location: client-side gateway; server untouched.

## Appendix: 429 audit & v2 proposals (2026-09-04)

A fresh-eyes audit of the shipped v1 gateway against *real* Gemini rate-limit
behavior, plus the v2 improvements it suggests. Findings cite the code as it
ships today; nothing below is implemented yet.

### Audit findings (severity-tagged)

1. **All 429s are treated identically (HIGH).** `client.js` maps every HTTP 429
to `code: 'RATE'`, and the gateway answers every RATE with the same flat
45-minute cooldown. Real Gemini quota errors come in two very different
classes: per-minute limits (`RATE_LIMIT_EXCEEDED`, clears in seconds-to-minutes)
and daily quota exhaustion (`RESOURCE_EXHAUSTED`, clears at a day boundary).
Today the app either goes quiet for 45 min over what was a 2-minute spike,
or wakes every 45 min to burn one request discovering a quota that is dead
until midnight.

2. **`Retry-After` is discarded (HIGH).** The client only looks at the status
code and error message — it never reads `res.headers.get('Retry-After')` (or
Gemini's `error.details[].metadata.retryDelay` in the body). Providers publish
exactly when a retry is safe; ignoring it means guessing.

3. **No escalation on repeated 429s (MEDIUM).** Every new 429 resets the same
45-min cooldown. A persistently-dead daily quota re-burns one request every
45 minutes for the rest of the day instead of learning to wait until reset.

4. **The cache is largely inert for the highest-volume kinds (HIGH).** The
cache key hashes `systemInstruction + userText + history`, and the system
prompts embed the live state report (hunger, memories, soul...), which changes
on every 15s tick. So `ask`, `post`, `chat`, and `usher` requests are
non-identical on any re-ask — the 40-entry/48h cache in the save mostly only
serves identical repeats (e.g., the intel surface with a stable prompt). The
headline "repeated asks are free" feature underdelivers where it matters most.

5. **Transient 5xx is mislabeled as `NO_KEY` (LOW-MED).** The proxy returns 503
when no key is configured, and `client.js` maps *only* 503 to `NO_KEY`. If the
proxy ever 503s for another reason (upstream down, boot), the UI tells the
user "no AI key" and Ryan's offline banner names the wrong cause. The proxy
can't currently tell them apart, so this is partly a server fix.

6. **The budget cap never adapts (MEDIUM).** `AI_BUDGET_CAP = 40` is static.
If real 429s arrive at, say, `used = 12`, the gateway keeps trying up to 39
for the rest of the day instead of learning that this key actually allows
less. Observational learning would self-tune the soft cap.

7. **Expired cache entries are never pruned (LOW).** `cacheGet` finds a live
entry but never removes expired ones; the save carries up to 40 stale entries
(≈1–3 KB each) indefinitely until overwritten — quiet save bloat on a cloud-
synced blob.

8. **The UI hides the *why* and the *how long* (LOW, UX).** `ask()` already
returns `reason`, but every surface renders the same "offline — the wire is
quiet" line. A 45-minute backoff and an all-day quota silence read identically
to the player, hiding exactly the drama the feature is meant to create.

### v2 proposals

- **v2-1 — Classify 429 flavors & honor `Retry-After`.** Pass retry metadata
out of `client.js` (`retryAfterMs` from the header when present, plus a
`quota` boolean when the error body/reason says `RESOURCE_EXHAUSTED`). The
gateway then branches: short-window rate limit → exponential backoff with
jitter (30s → 60s → 120s, cap ~15 min, no 45-min blanket); quota exhaustion →
`quotaDeadUntil = next day boundary` (or the advertised `Retry-After`), offline
in character until then ("The Tide is quiet until the next day, bro.").
- **v2-2 — Escalate cooldowns.** Track `cooldownTier` in `aiBudget`; double the
cooldown (45m → 90m → 180m → 12h) on repeated definitive quota 429s, reset to
45m on the first success. Stops the every-45-minute probing of a dead quota.
- **v2-3 — Intent cache on top of the exact cache.** Keep the exact-hash LRU,
and add a normalized *intent* key: hash on `kind + normalized userText`
(trimmed, case-folded, stop-word-stripped) rather than the live system
instruction. This is what makes repeated *semantic* asks free — the actual
budget lever the cache was meant to be.
- **v2-4 — Self-tuning budget.** On the first quota-class 429 of a day, set
`effectiveCap = min(cap, usedAtHit - 2)` for the rest of that day, so Ryan
soft-rations to just under what the key actually allows instead of running
into the wall every time near the top.
- **v2-5 — Separate transient 5xx from `NO_KEY`.** Server-side (optional but
clean): make the proxy distinguish 502/500 (upstream down → `TRANSIENT`) from
503 (no key → `NO_KEY`). Client-only fallback: treat any 5xx as `TRANSIENT`
with a short 2–5 min cooldown, keep 503's specific body check for `NO_KEY`.
- **v2-6 — Prune expired cache on read.** Filter TTL-expired entries inside
`cacheGet` so the save stays lean with no sweep timer.
- **v2-7 — Surface reason + ETA in the UI.** Render `result.reason` (and, when
present, `retryAfterMs`) in the offline banners: "🌑 offline — Ryan is
rationing his signal (budget)" vs "Gemini says: try again in ~3h (rate)."
- **v2-8 (optional server) — Forward `Retry-After`.** Have the proxy pass
Gemini's `Retry-After` through to the client so v2-1 works without client-side
guessing.

### Suggested build order

1. **v2-3 (intent cache)** — biggest budget win for the least change.
2. **v2-1 + v2-8 (429 classification + Retry-After)** — fixes the core
   "wrong silence length" problem.
3. **v2-2 (escalation)** — stops dead-quota probing.
4. **v2-4 (self-tuning cap), v2-7 (reason in UI)** — polish that makes the
   loop feel alive.
5. **v2-5 / v2-6** — correctness & hygiene.

No interface breaks: every v2 item stays behind `ask()` and extends
`aiBudget`/`aiCache` shapes with additive fields (`retryAfterMs`, `quota`,
`cooldownTier`, `quotaDeadUntil`, `effectiveCap`), all defaulted by
`normalizeState` for old saves.
