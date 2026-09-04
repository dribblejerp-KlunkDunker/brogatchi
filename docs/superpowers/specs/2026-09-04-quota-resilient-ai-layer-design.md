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
