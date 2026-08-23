// The wardrobe: renders gear grids and wires buy/equip buttons.

import { $ } from './hud.js';
import { SHIRTS, HATS, GLASSES, CHAINS, BACKPACKS, PANTS, SHOES, WRISTS } from '../core/ryanSpec.js';

export function renderWardrobe(state) {
  const inv = state.inventory;

  renderGrid('gear-hats', HATS, 'hat', inv.hat, (h) => h.id === 'none', (h) => h.glyph, inv);
  renderGrid('gear-shirts', SHIRTS, 'shirt', inv.shirt, (h) => inv.shirts.includes(h.id), (h) => null, inv);
  renderGrid('gear-pants', PANTS, 'pants', inv.pants, (h) => true, (h) => null, inv);
  renderGrid('gear-shoes', SHOES, 'shoes', inv.shoes, (h) => true, (h) => null, inv);
  renderGrid('gear-glasses', GLASSES, 'glasses', inv.glasses, (h) => h.id === 'none', (h) => glassesGlyph(h), inv);
  renderGrid('gear-chains', CHAINS, 'chains', inv.chains, (h) => h.id === 'none', (h) => chainGlyph(h), inv);
  renderGrid('gear-wrist', WRISTS, 'wrist', inv.wrist, (h) => h.id === 'none', (h) => wristGlyph(h), inv);
  renderGrid('gear-backpacks', BACKPACKS, 'backpacks', inv.backpacks, (h) => h.id === 'none', (h) => backGlyph(h), inv);
}

function renderGrid(containerId, items, kind, equippedId, isOwned, glyphFn, inv) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '';
  items.forEach((item) => {
    const owned = isOwned(item);
    const equipped = equippedId === item.id;
    const cls = ['gear-btn'];
    if (owned) cls.push('owned');
    if (equipped) cls.push('equipped');
    const costLabel = owned ? (equipped ? 'ON' : 'OWNED') : `${item.price}c`;
    const glyph = glyphFn(item);
    box.innerHTML += `
      <button class="${cls.join(' ')}" onclick="app.buyGear('${kind}', '${item.id}')" title="${item.name}">
        <span>${glyph || ''}</span>
        <span class="name">${item.name}</span>
        <span class="cost">${costLabel}</span>
      </button>`;
  });
}

function glassesGlyph(g) {
  if (g.id === 'none') return '🚫';
  return g.id === 'visor' ? '🥽' : '🕶️';
}
function chainGlyph(c) {
  if (c.id === 'none') return '🚫';
  if (c.id === 'gold') return '💰';
  if (c.id === 'dogtags') return '🎖️';
  return '⛓️';
}
function backGlyph(b) {
  if (b.id === 'none') return '🚫';
  return b.id === 'tactical' ? '🦺' : '🎒';
}
function wristGlyph(w) {
  if (w.id === 'none') return '🚫';
  if (w.id === 'gloves') return '🧤';
  if (w.id === 'band') return '⌚';
  return '🎮';
}

// Hat glyph is rendered on the pet; small helper for the slot.
export function hatGlyph(state) {
  const hat = HATS.find((h) => h.id === state.inventory.hat);
  return hat && hat.id !== 'none' ? hat.glyph : null;
}