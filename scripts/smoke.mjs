// Smoke test: parse the sample KIF and apply every move.
// Run with: node scripts/smoke.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const outFile = resolve(root, 'dist/smoke-core.mjs');
await build({
  entryPoints: [resolve(root, 'scripts/smoke-entry.ts')],
  bundle: true,
  outfile: outFile,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  logLevel: 'error',
});

const core = await import(pathToFileURL(outFile).href);
const { parseKifu, buildStates, pieceChar } = core;

const kifPath = resolve(root, 'data/alphazero_20181203.kif');
const text = readFileSync(kifPath, 'utf8');

const parsed = parseKifu(text);
console.log(`File: ${kifPath}`);
console.log(`Header keys: ${Object.keys(parsed.header).join(', ')}`);
console.log(`Moves parsed: ${parsed.moves.length}`);
console.log(`Warnings: ${parsed.warnings.length ? parsed.warnings.join('; ') : '(none)'}`);

const states = buildStates(parsed.initial, parsed.moves);
console.log(`States built: ${states.length} (expected ${parsed.moves.length + 1})`);

const final = states[states.length - 1];
const KANJI = '〇一二三四五六七八九';
console.log('\nFinal board (row 1 at top, col 9 at left):');
console.log('   9  8  7  6  5  4  3  2  1');
for (let r = 0; r < 9; r++) {
  let line = KANJI[r + 1] + ' ';
  for (let c = 8; c >= 0; c--) {
    const p = final.grid[r][c];
    if (!p) line += ' ・';
    else {
      const ch = pieceChar(p);
      line += (p.player === 'gote' ? 'v' : ' ') + ch;
    }
  }
  console.log(line);
}

const handStr = (hand) =>
  Object.entries(hand)
    .map(([k, v]) => `${k}×${v}`)
    .join(' ') || '(none)';
console.log(`\n先手持駒: ${handStr(final.hands.sente)}`);
console.log(`後手持駒: ${handStr(final.hands.gote)}`);

const lastMove = parsed.moves[parsed.moves.length - 1];
console.log(
  `\nLast move kind=${lastMove.kind}${lastMove.kind === 'terminator' ? ` label=${lastMove.label}` : ''}`,
);
