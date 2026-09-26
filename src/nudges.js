// NUDGES — the doorbell. Pure evaluator for Ryan's five conditions.
//
// Spec: docs/superpowers/specs/2026-09-26-nudges-design.md (as reviewed).
// Pure module (the petitions.js/dreams.js precedent): no DOM, no clock, no
// store — state, the runtime lastSent map, and the wall-clock hour all
// arrive as arguments; nothing mutates. The shell applies the returned
// `clear` list to lastSent and, when the gates pass, sends the event and
// stamps lastSent[event.key] itself.
//
// Every threshold is borrowed from state the UI already renders — if the
// panel wouldn't show it, the nudge doesn't send it.

// Quiet hours (default): everything except the petition deadline is silent.
export const QUIET_START = 22; // hour of day, inclusive
export const QUIET_END = 8;    // hour of day, exclusive

const HOUR_DEBOUNCE_MS = 6 * 60 * 60 * 1000; // crisis conditions: one nudge per episode

function isQuietHour(hour, quietStart = QUIET_START, quietEnd = QUIET_END) {
  return hour >= quietStart || hour < quietEnd;
}

/**
 * Evaluate the nudge conditions in priority order.
 *
 * @param {Object} state    read-only snapshot of the save
 * @param {Object} lastSent condition key → ms epoch of last send (runtime only)
 * @param {number} nowHour  local hour of day (0–23) for quiet hours
 * @param {number} now      ms epoch
 * @returns {{ event: { key, title, body, tag }, clear: string[] } | null}
 *          `clear` lists debounced keys whose condition has gone false
 *          (the caller applies it); null when nothing to say.
 */
export function evaluateNudges(state, lastSent, nowHour, now = Date.now()) {
  if (!state || typeof state !== 'object' || !state.stats) return null;
  const clears = [];
  const quiet = isQuietHour(nowHour);

  // Re-arm sweeps first: a condition that has gone false releases its key,
  // so the NEXT episode gets its own nudge (pure — the caller mutates).
  if (state.stats.hunger >= 25) clears.push('hunger');
  if (state.stats.energy >= 20 || state.sleeping) clears.push('energy');
  if (state.stats.happy >= 25) clears.push('happy');

  // 1 — the petition deadline. Exempt from quiet hours: the desk closing is
  // a deadline, not a mood. Keyed by the petition's id — a new ask is a new
  // nudge; grant/deny/expire ends the key forever.
  const live = state.petitions?.live;
  if (live && Number.isFinite(live.expiresAt)) {
    const remaining = live.expiresAt - now;
    if (remaining < 12 * 60 * 60 * 1000 && remaining > 0) {
      const key = `petition:${live.id}`;
      if (!lastSent[key]) {
        const hours = Math.max(1, Math.round(remaining / (60 * 60 * 1000)));
        return {
          event: {
            key,
            title: '📜 Your bro is waiting',
            body: `He asked: ${live.request || live.title}. The desk closes in ~${hours}h.`,
            tag: key,
          },
          clear: clears,
        };
      }
    }
  }

  // 2–4 — the crisis lanes (starving / drained / lonely). Quiet hours apply:
  // a mood is not a deadline. The evaluator owns the gate (it has nowHour);
  // the table's exemption column is implemented per-condition below.
  // 2 — starving (the vitals panel's own line: hunger < 25)
  if (!quiet && state.stats.hunger < 25) {
    if (!lastSent.hunger || now - lastSent.hunger >= HOUR_DEBOUNCE_MS) {
      return {
        event: { key: 'hunger', title: '🥺 Ryan is starving', body: 'The machine hungers. A pizza is two clicks away.', tag: 'hunger' },
        clear: clears,
      };
    }
  }

  // 3 — drained and NOT already resting (rest is the fix in progress)
  if (!quiet && state.stats.energy < 20 && !state.sleeping) {
    if (!lastSent.energy || now - lastSent.energy >= HOUR_DEBOUNCE_MS) {
      return {
        event: { key: 'energy', title: '😪 Ryan is drained', body: 'The rig hums. REST is right there.', tag: 'energy' },
        clear: clears,
      };
    }
  }

  // 4 — lonely (the sad face: happy < 25)
  if (!quiet && state.stats.happy < 25) {
    if (!lastSent.happy || now - lastSent.happy >= HOUR_DEBOUNCE_MS) {
      return {
        event: { key: 'happy', title: '😢 Ryan is lonely', body: 'Nobody has pet the bro in a while. Just saying.', tag: 'happy' },
        clear: clears,
      };
    }
  }

  // 5 — the walk, in the evening only (local hour ≥ 18, and never in quiet
  // hours — the window is 18:00–22:00 in practice), while the lane is
  // unfinished and at least 200 steps short. Once per day: the lane's own
  // rollover re-stamp IS the re-arm, so no time-debounce here.
  const p = state.pedometer;
  if (!quiet && p?.enabled && !p.today?.rewarded && nowHour >= 18) {
    const short = (p.goal || 2000) - (p.today.steps || 0);
    if (short >= 200 && !lastSent.walk) {
      return {
        event: { key: 'walk', title: '👟 The walk is undone', body: `${short.toLocaleString('en-US')} steps short of the quest. The evening is young.`, tag: 'walk' },
        clear: clears,
      };
    }
  }

  return clears.length ? { event: null, clear: clears } : null;
}
