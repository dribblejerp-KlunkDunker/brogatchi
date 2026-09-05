// Rebuild the production bundle and commit dist/ so tracked deployments
// never serve a stale build. Run from the project root:
//
//   npm run build:commit
//
// - Runs `npm run build` (vite build).
// - If dist/ ends up identical to HEAD it prints a note and exits 0 —
//   rebuilding unchanged source produces no commit and no noise.
// - Otherwise it stages ONLY dist/ and commits it, with a message that
//   records what the bundle was built from (HEAD hash + subject, plus the
//   uncommitted source files also sitting in the working tree), so the
//   history says exactly when and why the bundle moved.
// - Safe to run alongside other uncommitted work: only dist/ is staged.
//   Commit the source changes separately, then re-run to keep them paired.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

// "M  src/a.js" -> "src/a.js" (handles rename "old -> new" and quoting).
const pathOf = (line) => {
  let p = line.slice(3);
  if (p.includes(' -> ')) p = p.slice(p.lastIndexOf(' -> ') + 4);
  return p.startsWith('"') ? p.slice(1, -1) : p;
};

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' });

// Drive vite directly with node so this works on Windows too (spawning
// npm.cmd via execFileSync is not allowed without a shell).
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

try {
  // 1. Fresh production build.
  console.log('▶ Building production bundle…');
  run(process.execPath, [viteBin, 'build']);

  // 1b. Vite empties outDir on build, wiping the tracked dist/.nojekyll —
  // the marker that tells GitHub Pages NOT to run Jekyll (its default
  // processor chokes on or mangles asset folders). Restore it so a rebuild
  // can never silently break the Pages deploy.
  writeFileSync(join(root, 'dist', '.nojekyll'), '');

  // 2. If dist is gitignored in this checkout (e.g. the backup copy), skip.
  try {
    run('git', ['check-ignore', 'dist']);
    console.log('ℹ dist/ is gitignored in this checkout — nothing to commit.');
    process.exit(0);
  } catch { /* dist is tracked — continue */ }

  // 3. Nothing changed after the build? Already current.
  const distStatus = run('git', ['status', '--porcelain', '--', 'dist']);
  if (!distStatus.trim()) {
    console.log('✓ dist/ is unchanged after the build — the tracked bundle is already current.');
    process.exit(0);
  }

  // 4. Build a message that says what this bundle came from.
  const head = run('git', ['rev-parse', '--short', 'HEAD']).trim();
  const subject = run('git', ['log', '-1', '--pretty=%s']).trim();
  const distPaths = new Set(distStatus.split('\n').filter(Boolean).map(pathOf));
  const others = run('git', ['status', '--porcelain'])
    .split('\n')
    .filter(Boolean)
    .filter((l) => !distPaths.has(pathOf(l)));
  const otherPaths = [...new Set(others.map(pathOf).filter((p) => p && !p.startsWith('dist/')))];

  const lines = [
    'build: refresh tracked dist bundle',
    '',
    'Rebuilt with npm run build:commit so git deployments serve current source.',
    `Source: HEAD ${head} — ${subject}`,
  ];
  if (otherPaths.length > 0) {
    const shown = otherPaths.slice(0, 6).join(', ');
    const more = otherPaths.length > 6 ? ` (+${otherPaths.length - 6} more)` : '';
    lines.push(`Also present in working tree (uncommitted): ${shown}${more}`);
  }
  const message = lines.join('\n');

  // 5. Stage only dist and commit.
  run('git', ['add', '--', 'dist']);
  run('git', ['commit', '-m', message]);
  console.log(`✓ Committed dist (${run('git', ['log', '-1', '--pretty=%h']).trim()}): ${subject}`);
} catch (err) {
  console.error(`✗ build:commit failed: ${err.stderr || err.message}`);
  process.exit(1);
}
