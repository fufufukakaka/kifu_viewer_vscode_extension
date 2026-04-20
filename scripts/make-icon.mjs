// Render resources/icon.svg -> resources/icon.png at 128x128 via Playwright.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const svg = readFileSync(resolve(root, 'resources/icon.svg'), 'utf8');
const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:transparent}
  #box{width:128px;height:128px}
  svg{width:128px;height:128px;display:block}
</style><div id="box">${svg}</div>`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 128, height: 128 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(100);
const box = await page.locator('#box');
await box.screenshot({
  path: resolve(root, 'resources/icon.png'),
  omitBackground: false,
});
await browser.close();
console.log('wrote resources/icon.png');
