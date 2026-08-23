// Notification scheduling for Bro OS.
// Uses the Service Worker's postMessage channel to schedule local
// notifications even when the tab is in the background.

let swReg = null;
let permissionGranted = false;

export async function initNotifications() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  try {
    swReg = await navigator.serviceWorker.ready;
  } catch {
    return; // SW not available
  }
  if (Notification.permission === 'granted') {
    permissionGranted = true;
  }
}

// Ask the user for notification permission (called on first interaction).
export async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') {
    permissionGranted = true;
    return true;
  }
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    permissionGranted = result === 'granted';
    return permissionGranted;
  } catch {
    return false;
  }
}

function schedule(tag, title, body, delaySec = 0) {
  if (!permissionGranted || !swReg || !swReg.active) return;
  try {
    swReg.active.postMessage({
      type: 'schedule-notification',
      tag,
      title,
      body,
      delay: delaySec,
    });
  } catch { /* SW message failed — non-fatal */ }
}

// Schedule a hunger nudge: fires once, then reschedules if still hungry.
export function scheduleHungerNudge(state) {
  if (state.stats.hunger >= 30) return;
  schedule('bro-hunger', 'Ryan is starving! 🍕',
    `Hunger at ${Math.round(state.stats.hunger)}% — time to feed your bro.`, 0);
  // Re-check in 15 minutes
  schedule('bro-hunger-next', 'Ryan needs food!',
    `Hunger is low. Snacks required.`, 900);
}

// Schedule a sleep nudge: fires after 4 hours of no sleep.
export function scheduleSleepNudge(state, sleeping, sleepStartedAt) {
  if (sleeping) return;
  if (!sleepStartedAt) return;
  const awakeMs = Date.now() - sleepStartedAt;
  if (awakeMs < 4 * 60 * 60 * 1000) return; // less than 4 hours awake
  schedule('bro-tired', 'Ryan is exhausted! 💤',
    `Awake for ${Math.round(awakeMs / 3600000)}h — let him sleep.`, 0);
}

// Schedule a daily quest reminder at ~10 AM.
export function scheduleQuestReminder() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(10, 0, 0, 0);
  if (now > target) target.setDate(target.getDate() + 1);
  const delay = Math.max(0, Math.round((target.getTime() - now.getTime()) / 1000));
  schedule('bro-quests', 'Daily quests available! 📋',
    'Check in with Ryan — new quests and claims are live.', delay);
}