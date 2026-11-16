// EMBERLINE — hand-in program (Node 22, standard library only).
// Copies this repository's game/ and screenshots/ into the grader's output
// directory and writes dossier.json with the vendored make.fun library, so
// the judge can read the game. Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program is deterministic: two runs write byte-identical output.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Gate caps the scorer enforces on /output (see the competition's RULES):
// at most 4 screenshots of 256 KiB, at most 993 game files / 48 MiB.
const DOSSIER_OPTS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function fail(message) {
  throw new Error(`emberline main.ts: ${message}`);
}

function countEntries(dir) {
  let total = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    total += 1;
    if (statSync(path).isDirectory()) total += countEntries(path);
  }
  return total;
}

function checkTree() {
  const gameDir = join(repoRoot, 'game');
  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing');
  if (!existsSync(join(gameDir, 'vendor', 'three', 'three.module.min.js'))) {
    fail('game/vendor/three/three.module.min.js is missing');
  }
  if (!existsSync(join(gameDir, 'vendor', 'three', 'three.core.min.js'))) {
    fail('game/vendor/three/three.core.min.js is missing');
  }
  if (countEntries(gameDir) > DOSSIER_OPTS.game_max_files) {
    fail('game/ holds more than 993 entries');
  }
  const shotsDir = join(repoRoot, 'screenshots');
  if (existsSync(shotsDir)) {
    const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.'));
    if (shots.length > DOSSIER_OPTS.screenshots.max) fail('more than 4 screenshots');
    for (const shot of shots) {
      const bytes = statSync(join(shotsDir, shot)).size;
      if (bytes > DOSSIER_OPTS.screenshots.max_bytes) fail(`screenshot ${shot} is over 256 KiB`);
    }
  }
}

function handIn() {
  checkTree();
  mkdirSync(outDir, { recursive: true });
  cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  const shotsDir = join(repoRoot, 'screenshots');
  if (existsSync(shotsDir)) {
    cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
  }
  const dossier = buildDossier(outDir, DOSSIER_OPTS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

handIn();
