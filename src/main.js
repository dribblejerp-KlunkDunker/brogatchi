import { BroGatchiApp } from './ui/app.js';

// Keep the original global contract: HTML onclick handlers use `app.*`
window.app = new BroGatchiApp();

// PWA: register the service worker on secure contexts (https incl. LAN or
// localhost). Insecure http://LAN stays a normal mobile web app — no install.
// The worker is network-first for everything (see public/sw.js); we still
// ping registration.update() so a new worker is fetched promptly on revisit.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => { /* non-fatal */ });
  });
}