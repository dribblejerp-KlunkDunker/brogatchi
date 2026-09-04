import { BroGatchiApp } from './ui/app.js';

// Keep the original global contract: HTML onclick handlers use `app.*`
window.app = new BroGatchiApp();

// PWA: register the service worker on secure contexts (https incl. LAN or
// localhost). Insecure http://LAN stays a normal mobile web app — no install.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* non-fatal */ });
  });
}