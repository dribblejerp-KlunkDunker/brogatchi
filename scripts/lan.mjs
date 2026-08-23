// Cross-platform LAN launcher: `npm run dev:lan` and `npm run dev:lan:https`
// (passes "https" to enable basic-ssl in vite.config). Works on Windows,
// macOS and Linux — no shell env syntax.
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const mode = process.argv[2] === 'https' ? '2' : '1';

const child = spawn(process.execPath, [viteBin, '--host', '0.0.0.0'], {
  cwd: root,
  env: { ...process.env, LAN: mode },
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));