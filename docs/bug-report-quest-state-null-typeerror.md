# 🐛 TypeError: Cannot set properties of null (setting 'textContent') in `renderAll()` after the daily quest completes

> **Impact:** Every render tick throws for the rest of the session once `quest.rewarded` becomes `true`, killing the daily-quest counters on screen and — as a side effect discovered later — silently suppressing all of Moltbook's NPC tide replies.

---

## Summary

`renderAll()` in `src/main.js` dereferences `#quest-mined` and `#quest-goal-2` unconditionally. Those two spans live **inside** `#quest-state`, whose `innerHTML` is rewritten by the same function when the daily quest completes. From that moment the elements no longer exist, so every subsequent call throws:

```
TypeError: Cannot set properties of null (setting 'textContent')
    at $ (src/main.js:xxx)   # $('#quest-mined')
    at renderAll (src/main.js:xxx)
```

`renderAll()` runs on a 1-second interval (`setInterval(() => { store.tick(1); ... renderAll(); }, 1000)`), so the error repeats once per second until reload.

## Environment

- **App:** Bro OS 3.0 (`brogatchi`), vite build, any browser (pure DOM logic, no environment dependency)
- **First present in:** commit `6130ea4` — *feat: upgrade to Bro OS 3.0 Cyberpunk Utility architecture* (src/main.js last touched 2026-09-05)
- **Fixed in:** working tree (see *Suggested fix*) — regression test added in `tests/moltbook.ui.test.js`

## Preconditions

- Mining rig ON for long enough that `state.quest.mined >= state.quest.goal` (20 CR), i.e. `quest.rewarded === true`
  (≈ 2 minutes of real time with the default 6s mining interval, or instantly via the jsdom test helper `completeDailyQuest()`)

## Steps to reproduce

1. Boot the app (`npm run dev` or serve `dist/`), open DevTools → Console, clear it
2. Leave the mining rig running (MINE is ON by default) until the DAILY.QUEST card shows **COMPLETE ✓** and SYSLOG prints `[QUEST] DAILY.QUEST complete — GOLDEN.SHELL fund +50 CR`
3. Wait ~2 seconds and observe the console

**Actual result:** a new exception every second, for the rest of the session:

```
TypeError: Cannot set properties of null (setting 'textContent')
```

**Expected result:** a clean console after quest completion.

## Secondary symptom (the sneaky one)

The same exception aborts any event handler that calls `renderAll()` mid-handler. Concretely, Moltbook's TRANSMIT and reply flows run:

```
store.postToMolt(...) → render() → renderAll()  ← throws here
tideResponds(...)      → setTimeout(pushMoltReply, 3.5–6.5s)  ← never reached
```

so the tide's 55%-chance in-thread reply is **never scheduled** after quest completion. Users see it as "the tide never answers anymore". The 1-second tick loop survives because the exception is swallowed inside the interval callback — only the tail of each handler is lost.

## Root cause

`index.html:157` renders the running counter *nested inside* the state container:

```html
<span id="quest-state" class="text-text-muted">
  [<span id="quest-mined">0</span>/<span id="quest-goal-2">20</span>]
</span>
```

and `renderAll()` both mutates that subtree and rewrites it:

```js
// src/main.js — renderAll()
$('#quest-mined').textContent = s.quest.mined;      // ← throws once the span is gone
$('#quest-goal').textContent = s.quest.goal;
$('#quest-goal-2').textContent = s.quest.goal;      // ← same
$('#quest-bar').style.width = `${...}%`;
$('#quest-state').innerHTML = s.quest.rewarded
  ? '<span class="text-neon-amber text-glow-amber">COMPLETE ✓</span>'   // destroys both spans
  : `[<span id="quest-mined">${s.quest.mined}</span>/<span id="quest-goal-2">${s.quest.goal}</span>]`;
```

The `rewarded` branch replaces the whole subtree — including the nodes the lines above it just wrote to — so the very next tick (and every tick after) queries removed nodes. This is the classic **innerHTML-destroys-what-you-just-queried** pattern: the code assumes `#quest-mined`/`#quest-goal-2` are persistent, but a sibling branch of the same renderer treats them as disposable.

## Suggested fix (shipped)

Guard the optional lookups; the `COMPLETE ✓` rewrite below already renders fresh values, so the guarded writes are only needed while the unrewarded markup exists:

```js
// quest — #quest-mined / #quest-goal-2 live INSIDE #quest-state, whose
// innerHTML is rewritten below (they vanish once the quest completes).
// Update them only while they exist; #quest-goal (outside) is always safe.
const questMinedEl = $('#quest-mined');
if (questMinedEl) questMinedEl.textContent = s.quest.mined;
$('#quest-goal').textContent = s.quest.goal;
const questGoal2El = $('#quest-goal-2');
if (questGoal2El) questGoal2El.textContent = s.quest.goal;
$('#quest-bar').style.width = `${Math.min(100, (s.quest.mined / s.quest.goal) * 100)}%`;
```

Alternative (equally valid, slightly larger diff): move `<span id="quest-mined">`/`<span id="quest-goal-2">` **outside** `#quest-state` in `index.html`/`preview.html` and toggle only the state text. Avoid the tempting one-liner `$('#quest-mined')?.textContent = ...` — it hides the null instead of documenting the destroyed-subtree contract, and reads as an accident rather than a decision.

## Regression test

`tests/moltbook.ui.test.js` boots the real shell in jsdom and reproduces the bug through gameplay, not by hand-crafting state:

```js
// runs the real 1s ticker until the quest completes (spans destroyed)
vi.advanceTimersByTime(126 * 1000);
expect(document.getElementById('quest-state').textContent).toContain('COMPLETE ✓');

// the old bug threw inside the TRANSMIT handler and never scheduled the reply
postViaComposer('must not crash on rewarded quest');
vi.advanceTimersByTime(3500);
expect(mine.querySelector('.molt-reply-toggle').textContent).toContain('1 REPLY');
```

## Verification

- jsdom suite (45/45 green) includes the regression test above
- Live preview soak with `quest.rewarded: true`: 70+ one-second `renderAll()` ticks, both spans confirmed `null` without throwing, console log completely empty, mining loop alive throughout

## Severity / priority assessment

- **User-facing severity:** low-moderate — cosmetic counters die and NPC replies vanish, but the core loop, saves, and other windows keep working
- **Priority:** worth fixing immediately anyway: it fires every second, it corrupts unrelated features (Moltbook replies) in non-obvious ways, and the same `renderAll()` pattern is shared by every window, so any future template change can reintroduce the class of bug

## Related hardening ideas

- Sweep the other window renderers (`wireShop`, `wireJooh`, `wireSoul`, `wireSettings`) for the same "innerHTML rewrite removes nodes that are also queried directly" pattern
- Consider a tiny `$orNull(sel, root)` helper so guarded lookups document intent instead of reading like accidents
