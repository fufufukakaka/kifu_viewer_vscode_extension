// Capture evidence for Phase 2 — handicap rendering + comment round-trip.
// Run: node scripts/screenshot-phase2.mjs

import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, '.artifacts/kifu-viewer');
mkdirSync(outDir, { recursive: true });

const base = process.env.HARNESS_URL ?? 'http://localhost:5174/';

// Restore comment KIF to its canonical state so the test is repeatable.
const commentKifPath = resolve(root, 'data/test_comments.kif');
const commentKifOriginal = `開始日時：2026/04/20
棋戦：コメント編集テスト
手合割：平手
先手：Alice
後手：Bob
手数----指手---------消費時間--
*開始局面へのコメント。
1 ７六歩(77) (00:00/00:00:00)
*先手の１手目。角道を開ける定跡。
2 ８四歩(83) (00:00/00:00:00)
3 ２六歩(27) (00:00/00:00:00)
*飛車先の歩を伸ばす。
4 ３四歩(33) (00:00/00:00:00)
`;
writeFileSync(commentKifPath, commentKifOriginal, 'utf8');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

async function waitForBoard() {
  await page.waitForSelector('.board .cell', { timeout: 10_000 });
  await page.waitForTimeout(200);
}

async function snap(name) {
  await page.screenshot({ path: resolve(outDir, name), fullPage: true });
  console.log(`saved ${name}`);
}

// ---- Handicap: 二枚落ち initial position
await page.goto(`${base}?file=test_handicap_2mai.kif`, { waitUntil: 'networkidle' });
await waitForBoard();
await snap('p2-01-handicap-initial.png');

// Advance 1 move (上手 指し、move 1 should be displayed).
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
await snap('p2-02-handicap-after-m1.png');

// ---- Comment editing round-trip
await page.goto(`${base}?file=test_comments.kif`, { waitUntil: 'networkidle' });
await waitForBoard();
// Jump to move 1 which has an existing comment.
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
await snap('p2-03-comment-before-edit.png');

// Edit the comment textarea.
const textarea = await page.locator('.comment-textarea');
await textarea.fill('先手の１手目。角道を開ける定跡。\n【編集済み】この局面は横歩取りや角換わりへ分岐する。');
// Commit via Cmd+S (we emulate by blurring, which triggers save).
await page.locator('body').click();
await page.waitForTimeout(500); // wait for round-trip
await snap('p2-04-comment-after-edit.png');

// Move away then back — verify comment persists after reload through the file.
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(150);
await snap('p2-05-comment-after-reload.png');

// Verify the file was actually updated on disk.
const updated = readFileSync(commentKifPath, 'utf8');
const ok = updated.includes('【編集済み】') && updated.includes('角換わり');
console.log(`disk persisted: ${ok}`);

console.log('\n--- console logs ---');
for (const l of logs) console.log(l);

await browser.close();
process.exit(ok ? 0 : 1);
