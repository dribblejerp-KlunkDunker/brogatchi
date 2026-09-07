// Tiny .env loader — no dotenv dependency. Reads KEY=VALUE lines, ignores
// comments/blank lines, never overrides variables already in the environment.
// Loads the app's brogatchi/.env first (GEMINI_API_KEY lives there), then the
// bridge's own bridge/.env (MOLTBOOK_API_KEY etc.) so bridge settings can
// refine but not accidentally clobber app secrets.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function parseEnv(text) {
  const out = {};
  if (typeof text !== 'string') return out;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

// Resolve paths relative to the repo root (bridge/src -> bridge -> brogatchi).
export function loadEnv({ appEnv = true, bridgeEnv = true } = {}) {
  const merged = {};
  const sources = [];
  if (appEnv) {
    const p = resolve(here, '../../.env');
    if (existsSync(p)) sources.push(p);
  }
  if (bridgeEnv) {
    const p = resolve(here, '../.env');
    if (existsSync(p)) sources.push(p);
  }
  for (const p of sources) {
    const parsed = parseEnv(readFileSync(p, 'utf8'));
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in merged)) merged[k] = v;
    }
  }
  // Real environment always wins over file values.
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && merged[k] === undefined) merged[k] = v;
  }
  return { values: merged, sources };
}

export const BRIDGE_DIR = resolve(here, '..');
export const REPO_DIR = resolve(here, '../..');
