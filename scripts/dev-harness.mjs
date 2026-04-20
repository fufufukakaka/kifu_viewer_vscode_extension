// Stand-alone harness that mimics the VSCode webview shell so we can preview
// the UI in a normal browser. Serves the dist/ bundle and a chosen KIF file
// from data/. Supports ?file=xxx.kif and posts save-comment messages as
// in-memory edits so the UI round-trip can be tested without VSCode.
// Run: node scripts/dev-harness.mjs [port]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const port = parseInt(process.argv[2] ?? '5173', 10);

const coreBundle = resolve(root, 'dist/smoke-core.mjs');
await build({
  entryPoints: [resolve(root, 'scripts/smoke-entry.ts')],
  bundle: true,
  outfile: coreBundle,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  logLevel: 'error',
});
await build({
  entryPoints: [resolve(root, 'src/webview/main.ts')],
  bundle: true,
  outfile: resolve(root, 'dist/webview.js'),
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  sourcemap: true,
  logLevel: 'error',
});
const { parseKifu, buildStates } = await import(coreBundle);

const dataDir = resolve(root, 'data');

function resolveKifPath(fileParam) {
  const name = fileParam ?? 'alphazero_20181203.kif';
  const p = resolve(dataDir, name);
  if (!p.startsWith(dataDir)) throw new Error('forbidden path');
  if (!existsSync(p)) throw new Error(`not found: ${name}`);
  return p;
}

function buildPayload(kifPath) {
  const text = readFileSync(kifPath, 'utf8');
  const parsed = parseKifu(text);
  const states = buildStates(parsed.initial, parsed.moves);
  return {
    header: parsed.header,
    moves: parsed.moves,
    states,
    comments: Array.from(parsed.comments.entries()),
    warnings: parsed.warnings,
    fileName: kifPath.slice(kifPath.lastIndexOf('/') + 1),
    goteMovesFirst: parsed.goteMovesFirst,
    playerLabels: parsed.playerLabels,
    moveLineNumbers: parsed.moveLineNumbers,
  };
}

// Simulate the extension-side saveComment edit directly on disk, then the
// client reloads via `fetch('/payload?file=...')` which re-parses.
function applySaveComment(kifPath, stateIndex, lines) {
  const text = readFileSync(kifPath, 'utf8');
  const parsed = parseKifu(text);
  const allLines = text.split(/\r?\n/);

  let anchor;
  if (stateIndex === 0) {
    anchor = allLines.findIndex((l) => l.startsWith('手数'));
  } else if (stateIndex <= parsed.moveLineNumbers.length) {
    anchor = parsed.moveLineNumbers[stateIndex - 1] - 1;
  } else {
    return;
  }

  let blockStart = anchor + 1;
  let blockEnd = blockStart;
  while (blockEnd < allLines.length && allLines[blockEnd].startsWith('*')) blockEnd++;

  const newBlock = lines.flatMap((l) => l.split(/\r?\n/)).map((l) => '*' + l);
  const next = [...allLines.slice(0, blockStart), ...newBlock, ...allLines.slice(blockEnd)];
  writeFileSync(kifPath, next.join('\n'), 'utf8');
}

const harnessHtml = (payloadJson, fileParam) => /* html */ `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8" />
<title>Kifu Viewer — dev harness (${fileParam})</title>
<link rel="stylesheet" href="/dist/webview.css" />
</head>
<body>
<div id="root"></div>
<script>
  const fileParam = ${JSON.stringify(fileParam)};
  window.acquireVsCodeApi = function () {
    let state = null;
    return {
      postMessage: (m) => {
        console.log('[postMessage]', m);
        if (m.type === 'saveComment') {
          fetch('/save-comment?file=' + encodeURIComponent(fileParam), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(m),
          }).then(async () => {
            const r = await fetch('/payload?file=' + encodeURIComponent(fileParam));
            const p = await r.json();
            window.postMessage({ type: 'update', payload: p }, '*');
          });
        }
      },
      getState: () => state,
      setState: (s) => { state = s; },
    };
  };
  window.__seed = ${payloadJson};
</script>
<script src="/dist/webview.js"></script>
<script>
  window.postMessage({ type: 'update', payload: window.__seed }, '*');
</script>
</body>
</html>`;

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.html': 'text/html; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const fileParam = url.searchParams.get('file') ?? 'alphazero_20181203.kif';

    if (url.pathname === '/' || url.pathname === '/index.html') {
      const kifPath = resolveKifPath(fileParam);
      const payload = JSON.stringify(buildPayload(kifPath));
      res.writeHead(200, { 'content-type': MIME['.html'] });
      res.end(harnessHtml(payload, fileParam));
      return;
    }
    if (url.pathname === '/payload') {
      const kifPath = resolveKifPath(fileParam);
      const payload = JSON.stringify(buildPayload(kifPath));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(payload);
      return;
    }
    if (url.pathname === '/save-comment' && req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const kifPath = resolveKifPath(fileParam);
      applySaveComment(kifPath, body.stateIndex, body.lines);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }
    if (url.pathname.startsWith('/dist/')) {
      const p = resolve(root, url.pathname.slice(1));
      if (!p.startsWith(resolve(root, 'dist'))) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      const body = readFileSync(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
      res.end(body);
      return;
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    res.writeHead(500); res.end(String(e));
  }
});

server.listen(port, () => {
  console.log(`Dev harness: http://localhost:${port}/?file=alphazero_20181203.kif`);
});
