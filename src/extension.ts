import * as path from 'path';
import * as vscode from 'vscode';
import { parseKifu } from './kifParser';
import { ExtensionToWebview, KifuPayload, WebviewToExtension } from './messages';
import { buildStates } from './shogi';

// Tracks the active preview for each source document URI.
const panelsByUri = new Map<string, vscode.WebviewPanel>();

export function activate(context: vscode.ExtensionContext): void {
  const showPreview = (column: vscode.ViewColumn) => async (uri?: vscode.Uri) => {
    const target = await resolveTargetUri(uri);
    if (!target) {
      vscode.window.showWarningMessage('Kifu Viewer: active file is not a .kif file');
      return;
    }
    const existing = panelsByUri.get(target.toString());
    if (existing) {
      existing.reveal(column);
      return;
    }
    const panel = createPreviewPanel(context, target, column);
    panelsByUri.set(target.toString(), panel);
    panel.onDidDispose(() => panelsByUri.delete(target.toString()));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('kifuViewer.showPreview', showPreview(vscode.ViewColumn.Active)),
    vscode.commands.registerCommand(
      'kifuViewer.showPreviewToSide',
      showPreview(vscode.ViewColumn.Beside),
    ),
  );

  // Live reload on document changes.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      const panel = panelsByUri.get(e.document.uri.toString());
      if (!panel) return;
      postPayload(panel, e.document);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const panel = panelsByUri.get(doc.uri.toString());
      if (!panel) return;
      postPayload(panel, doc);
    }),
  );
}

export function deactivate(): void {
  for (const panel of panelsByUri.values()) panel.dispose();
  panelsByUri.clear();
}

async function resolveTargetUri(uri?: vscode.Uri): Promise<vscode.Uri | undefined> {
  if (uri && uri.fsPath.toLowerCase().endsWith('.kif')) return uri;
  const editor = vscode.window.activeTextEditor;
  if (editor && editor.document.fileName.toLowerCase().endsWith('.kif')) {
    return editor.document.uri;
  }
  return undefined;
}

function createPreviewPanel(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  column: vscode.ViewColumn,
): vscode.WebviewPanel {
  const fileName = path.basename(uri.fsPath);
  const panel = vscode.window.createWebviewPanel(
    'kifuViewer.preview',
    `Kifu: ${fileName}`,
    column,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      retainContextWhenHidden: true,
    },
  );

  panel.webview.html = renderHtml(panel.webview, context.extensionUri);

  panel.webview.onDidReceiveMessage(async (msg: WebviewToExtension) => {
    if (msg.type === 'ready') {
      const doc = await vscode.workspace.openTextDocument(uri);
      postPayload(panel, doc);
    } else if (msg.type === 'jumpToMove') {
      await jumpToMoveLine(uri, msg.moveIndex);
    } else if (msg.type === 'saveComment') {
      await saveComment(uri, msg.stateIndex, msg.lines);
    }
  });

  return panel;
}

async function jumpToMoveLine(uri: vscode.Uri, moveIndex: number): Promise<void> {
  // Open the source document and reveal the line for the given move.
  const doc = await vscode.workspace.openTextDocument(uri);
  const parsed = parseKifu(doc.getText());
  if (moveIndex < 1 || moveIndex > parsed.moveLineNumbers.length) return;
  const line = parsed.moveLineNumbers[moveIndex - 1] - 1;
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: vscode.ViewColumn.One,
    preserveFocus: false,
  });
  const range = new vscode.Range(line, 0, line, 0);
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function postPayload(panel: vscode.WebviewPanel, doc: vscode.TextDocument): void {
  try {
    const parsed = parseKifu(doc.getText());
    const states = buildStates(parsed.initial, parsed.moves);
    const payload: KifuPayload = {
      header: parsed.header,
      moves: parsed.moves,
      states,
      comments: Array.from(parsed.comments.entries()),
      warnings: parsed.warnings,
      fileName: path.basename(doc.fileName),
      goteMovesFirst: parsed.goteMovesFirst,
      playerLabels: parsed.playerLabels,
      moveLineNumbers: parsed.moveLineNumbers,
    };
    const msg: ExtensionToWebview = { type: 'update', payload };
    panel.webview.postMessage(msg);
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    vscode.window.showErrorMessage(`Kifu Viewer: failed to parse — ${err}`);
  }
}

// Replace comment lines attached to the given state index with the supplied
// lines. State 0 = initial position (comments live between the header and the
// first move line). State k (k>=1) lives immediately after the k-th move line.
async function saveComment(
  uri: vscode.Uri,
  stateIndex: number,
  lines: string[],
): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const parsed = parseKifu(doc.getText());
  const totalMoves = parsed.moves.length;
  if (stateIndex < 0 || stateIndex > totalMoves) return;

  const allLines = doc.getText().split(/\r?\n/);
  const eol = doc.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';

  // Anchor = index (0-based) of the line AFTER which the comment block sits.
  //   stateIndex 0  -> the 手数---- header row (or last header row if no header).
  //   stateIndex k  -> the k-th move line.
  let anchor: number;
  if (stateIndex === 0) {
    // Find the "手数----" table header row.
    anchor = allLines.findIndex((l) => l.startsWith('手数'));
    if (anchor < 0) {
      // No table header; insert right before the first move line if any.
      if (parsed.moveLineNumbers.length > 0) {
        anchor = parsed.moveLineNumbers[0] - 2;
      } else {
        anchor = allLines.length - 1;
      }
    }
  } else {
    anchor = parsed.moveLineNumbers[stateIndex - 1] - 1; // 0-based
  }

  // Existing comment block: consecutive lines starting with "*" right after anchor.
  let blockStart = anchor + 1;
  let blockEnd = blockStart; // exclusive
  while (blockEnd < allLines.length && allLines[blockEnd].startsWith('*')) {
    blockEnd++;
  }

  // Build the replacement text.
  const newBlock = lines
    .flatMap((l) => l.split(/\r?\n/))
    .map((l) => '*' + l)
    .join(eol);

  const edit = new vscode.WorkspaceEdit();
  // Range covers [blockStart, blockEnd): lines we want to replace wholesale.
  const startPos = new vscode.Position(blockStart, 0);
  let replacement: string;
  let endPos: vscode.Position;
  if (blockEnd > blockStart) {
    // Replace from start of blockStart up to start of blockEnd.
    endPos = new vscode.Position(blockEnd, 0);
    replacement = newBlock.length > 0 ? newBlock + eol : '';
  } else {
    // Insert: range is empty at blockStart start.
    endPos = startPos;
    replacement = newBlock.length > 0 ? newBlock + eol : '';
  }
  edit.replace(uri, new vscode.Range(startPos, endPos), replacement);
  await vscode.workspace.applyEdit(edit);
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.js'),
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview.css'),
  );
  const nonce = generateNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `font-src ${webview.cspSource}`,
    `img-src ${webview.cspSource} data:`,
  ].join('; ');
  return /* html */ `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>Kifu Viewer</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
