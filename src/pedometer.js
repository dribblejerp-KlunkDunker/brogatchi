// STEP.SYNC sensor layer — the browser half of the pedometer.
//
// PROTOTYPE for the v3.4.0 pedometer spec (docs/superpowers/specs/
// 2026-09-26-pedometer-design.md). Lives outside the store by layering
// rule: this module may only call store.addSteps(batch) — every reward,
// trait shift, and memory is store logic, so tests inject steps without
// a browser and the seam stays one-way (the ghost scrub-log lesson).
//
// Heuristic (declared approximate — 2.0's pedometer was a joke too):
// count a step when |accelerationIncludingGravity| dips below
// g − 1.2 m/s² and crosses back above g, with ≥ 250 ms since the last
// count. Deltas batch for at most 3 s so the store emitter never spins
// at sensor rate.

const G = 9.81;
const DROP = 1.2;          // dip threshold below gravity (m/s²)
const REFRACTORY_MS = 250; // min gap between counted steps
const FLUSH_MS = 3000;     // max batch delay before addSteps

export function createPedometer(store, onStatus) {
  let listening = false;
  let batch = 0;
  let lastStepAt = 0;
  let below = false;        // inside a dip?
  let flushTimer = null;
  let handler = null;
  let report = (s) => { try { onStatus?.(s); } catch { /* status is cosmetic */ } };

  function flush() {
    flushTimer = null;
    if (batch > 0) {
      const n = batch;
      batch = 0;
      store.addSteps(n);
    }
  }
  function scheduleFlush() {
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z)) return; // desktop empty events
    const mag = Math.hypot(a.x, a.y, a.z);
    const t = e.timeStamp || Date.now();
    if (!below && mag < G - DROP) {
      below = true; // entered the dip
    } else if (below && mag >= G) {
      below = false; // crossed back — that oscillation was a step
      if (t - lastStepAt >= REFRACTORY_MS) {
        lastStepAt = t;
        batch += 1;
        scheduleFlush();
      }
    }
  }

  /** Attach listeners. Returns the resulting status. iOS 13+ requires
      requestPermission() inside a user gesture — the toggle's click is
      that gesture, so call start() from the handler. */
  async function start() {
    if (listening) return 'LISTENING';
    const DM = typeof window !== 'undefined' ? window.DeviceMotionEvent : undefined;
    if (!DM) { report('UNSUPPORTED'); return 'UNSUPPORTED'; }
    try {
      if (typeof DM.requestPermission === 'function') {
        const res = await DM.requestPermission();
        if (res !== 'granted') { report('DENIED'); return 'DENIED'; }
      }
    } catch { report('DENIED'); return 'DENIED'; }
    handler = onMotion;
    window.addEventListener('devicemotion', handler);
    listening = true;
    report('LISTENING');
    return 'LISTENING';
  }

  function stop() {
    if (handler) window.removeEventListener('devicemotion', handler);
    handler = null;
    listening = false;
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (batch > 0) { const n = batch; batch = 0; store.addSteps(n); }
    report('OFF');
  }

  return { start, stop };
}
