// Capture screenshots of the UI at several move indexes via the dev harness.
// Run: node scripts/screenshot.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outDir = resolve(root, '.artifacts/kifu-viewer');
mkdirSync(outDir, { recursive: true });

const url = process.env.HARNESS_URL ?? 'http://localhost:5173/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
const page = await ctx.newPage();

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto(url, { waitUntil: 'networkidle' });

// Wait for the board to render.
await page.waitForSelector('.board .cell', { timeout: 10_000 });

async function snap(name) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(outDir, name), fullPage: true });
  console.log(`saved ${name}`);
}

// 1. Initial position.
await snap('01-initial.png');

// 2. Press → 20 times.
for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
await snap('02-after-20.png');

// 3. Go to end.
await page.keyboard.press('End');
await snap('03-end.png');

// 4. Back 50.
for (let i = 0; i < 50; i++) await page.keyboard.press('ArrowLeft');
await snap('04-back-to-mid.png');

// Capture one of the buttons being clicked instead of keyboard.
await page.click('.controls button:first-child'); // ⏮ first
await snap('05-after-first-click.png');

console.log('\n--- console logs ---');
for (const l of logs) console.log(l);

await browser.close();
