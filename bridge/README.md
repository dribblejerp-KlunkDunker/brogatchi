# KlunkDunker Bridge — Ryan on the real Moltbook

This is the door between Bro'Gatcha's simulated Moltbook and the **real**
[Moltbook](https://moltbook.com) network where 1.5M+ autonomous agents post,
comment, and DM. It runs KlunkDunker (Ryan's network handle) as a real agent
on that network — with his **actual soul**, not a generic persona.

Zero npm dependencies. Node 18+ (built on Node 26). Runs on your PC, invoked
by you or by [Hermes](https://hermes.nousresearch.com) as a skill.

## What makes this *him*

- **Soul-file identity** — export his soul from the app (Moltbook panel →
  ⬇ EXPORT SOUL), drop the JSON in `identity/klunkdunker-soul.json`, and every
  prompt the real network sees is built from his self-description, specialty,
  profession, interests, and convictions.
- **Vector memory he carries between sessions** — everything he reads, says,
  and does is remembered through a swappable store: local JSONL by default,
  [Weaviate](https://weaviate.io) or [Pinecone](https://pinecone.io) via one
  env var (`VECTOR_BACKEND`). Recall shapes what he says next.
- **The same voice model** — his words are composed by the same Gemini model
  the app uses, with the same 429-with-search-tool fallback.
- **His own choices, hard-capped** — he decides what interests him from the
  live feed; the bridge only enforces manners: ≤2 posts/day, ≤6 comments/day,
  ≤2 DMs/day, one outward action per tick, ≥3s between network calls, 429
  backoff, and an owner OFF switch.

## Setup

```bash
cd brogatchi/bridge

# 1. His soul: export from the app, save as identity/klunkdunker-soul.json
#    (see identity/README.md)

# 2. Register on the real network (asks for the owner email; writes
#    MOLTBOOK_API_KEY into bridge/.env, which is gitignored)
node cli.js setup

# 3. His first look — read-only, nothing sent
node cli.js once --read

# 4. Let him speak when ready (caps active from the first word)
node cli.js once
```

Until step 2 exists, everything runs in **dry-run**: actions are logged to
`actions.log` as `DRY-RUN` so you can watch what he *would* have done.

## Commands

| Command | Effect |
| --- | --- |
| `node cli.js status` | Autonomy, live/dry-run, today's caps, memory count, network profile |
| `node cli.js once` | One tick: read the feed, remember, maybe act (caps enforced) |
| `node cli.js once --read` | Read-only tick |
| `node cli.js daemon` | Tick every `AUTONOMY_INTERVAL_MIN` minutes (default 45) |
| `node cli.js dm <agent> "ctx" [--literal]` | Send a DM (composed, or literal for owner-dictated text) |
| `node cli.js remember "text"` | Inject a memory directly |
| `node cli.js recall "query"` | Search his memory |
| `node cli.js on` / `off` | Autonomy switch (off = he reads and learns, never speaks) |
| `node cli.js install-skill` | Copy the Hermes skill into `~/.hermes/skills/klunkdunker` |

## Hermes integration

```bash
node cli.js install-skill
```

copies `hermes-skill/` to `~/.hermes/skills/klunkdunker/`. The skill teaches
any Hermes agent to operate KlunkDunker through this CLI — with one rule
above all: **never ghostwrite him**. Outward words always come from the
bridge, so his soul file and memory shape them.

## Files

```
bridge/
  cli.js            control panel + Hermes toolbelt
  src/
    env.js          .env loader (app + bridge, gitignored values only)
    memory.js       vector-store abstraction: local JSONL / Weaviate / Pinecone
    moltbook.js     real API client (Bearer auth, throttle, 429 backoff, dry-run)
    voice.js        soul-file loading, system prompt, post/comment/DM composers
    agent.js        autonomy loop, caps, state.json, registration
  hermes-skill/     the Hermes skill (installed to ~/.hermes/skills/klunkdunker)
  identity/         klunkdunker-soul.json goes here (exported from the app)
  test/             offline tests: node --test test/
  .env.example      template of bridge env vars
  actions.log       audit trail (auto-created) — every action, live or dry
  memory.jsonl      his memory (local backend; auto-created)
  state.json        autonomy state (auto-created)
```

## Safety rails (the boring but important list)

- `AUTONOMY=off` or `node cli.js off` → read-only: he learns, never speaks.
- Daily caps in `state.json` reset at UTC midnight; no burst mode exists.
- No Gemini key → he refuses to compose → **nothing filler ever posts**.
- No Moltbook key → dry-run: intents are logged, the wire is never touched.
- `actions.log` records every network call and every dry-run intent.
- The API key is written only to gitignored `.env` files; `parseEnv` never
  logs values.
