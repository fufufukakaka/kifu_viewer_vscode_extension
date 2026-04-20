import './style.css';
import { ExtensionToWebview, KifuPayload, WebviewToExtension } from '../messages';
import {
  Board,
  Move,
  PIECE_CHAR_PROMOTED,
  PIECE_CHAR_UNPROMOTED,
  PieceKind,
  Piece,
} from '../shogi';

declare function acquireVsCodeApi(): {
  postMessage(msg: WebviewToExtension): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
};

const vscode = acquireVsCodeApi();

interface AppState {
  payload: KifuPayload | null;
  currentIndex: number; // 0 = initial position; k = after k-th move.
}

const state: AppState = {
  payload: vscode.getState<AppState>()?.payload ?? null,
  currentIndex: vscode.getState<AppState>()?.currentIndex ?? 0,
};

// Transient UI flags that must not be re-rendered naively.
const editing = { commentFocused: false };

function persist(): void {
  vscode.setState({ ...state });
}

function pieceChar(p: Piece): string {
  return p.promoted ? PIECE_CHAR_PROMOTED[p.kind] : PIECE_CHAR_UNPROMOTED[p.kind];
}

// ---------- Rendering ----------

const root = document.getElementById('root')!;

function render(): void {
  root.replaceChildren();
  if (!state.payload) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'KIF を読み込み中…';
    root.appendChild(empty);
    return;
  }
  const { payload } = state;
  root.appendChild(renderHeader(payload));
  if (payload.warnings.length > 0) {
    root.appendChild(renderWarnings(payload.warnings));
  }
  root.appendChild(renderBoardArea(payload));
  root.appendChild(renderControls(payload));
  root.appendChild(renderCurrentMove(payload));
  root.appendChild(renderComment(payload));
  root.appendChild(renderMoveList(payload));
}

function renderHeader(p: KifuPayload): HTMLElement {
  const header = document.createElement('header');
  header.className = 'kifu-header';
  const h = document.createElement('h1');
  h.textContent = p.fileName;
  header.appendChild(h);
  const meta = document.createElement('div');
  meta.className = 'kifu-meta';
  const senteKey = p.goteMovesFirst ? '下手' : '先手';
  const goteKey = p.goteMovesFirst ? '上手' : '後手';
  const entries: Array<[string, string | undefined]> = [
    [senteKey, p.playerLabels.sente ?? undefined],
    [goteKey, p.playerLabels.gote ?? undefined],
    ['棋戦', p.header['棋戦']],
    ['手合割', p.header['手合割']],
    ['開始日時', p.header['開始日時']],
  ];
  for (const [k, v] of entries) {
    if (!v) continue;
    const span = document.createElement('span');
    span.textContent = `${k}: ${v}`;
    meta.appendChild(span);
  }
  header.appendChild(meta);
  return header;
}

function renderWarnings(ws: string[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'warnings';
  el.textContent = ws.join('\n');
  return el;
}

function renderBoardArea(p: KifuPayload): HTMLElement {
  const area = document.createElement('div');
  area.className = 'board-area';
  const board = p.states[state.currentIndex];
  const currentMove = state.currentIndex > 0 ? p.moves[state.currentIndex - 1] : null;

  area.appendChild(renderHand(board, 'gote', p));
  area.appendChild(renderBoard(board, currentMove));
  area.appendChild(renderHand(board, 'sente', p));
  return area;
}

const HAND_ORDER: PieceKind[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];

function renderHand(
  board: Board,
  player: 'sente' | 'gote',
  payload: KifuPayload,
): HTMLElement {
  const el = document.createElement('div');
  el.className = `hand ${player}`;
  const label = document.createElement('span');
  label.className = 'hand-label';
  const senteLabel = payload.goteMovesFirst ? '下手' : '先手';
  const goteLabel = payload.goteMovesFirst ? '上手' : '後手';
  label.textContent = player === 'sente' ? `☗${senteLabel}` : `☖${goteLabel}`;
  el.appendChild(label);
  const hand = board.hands[player];
  let total = 0;
  for (const kind of HAND_ORDER) {
    const count = hand[kind] ?? 0;
    if (count === 0) continue;
    total++;
    const piece = document.createElement('span');
    piece.className = 'hand-piece';
    const ch = document.createElement('span');
    ch.textContent = PIECE_CHAR_UNPROMOTED[kind];
    piece.appendChild(ch);
    if (count > 1) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = String(count);
      piece.appendChild(c);
    }
    el.appendChild(piece);
  }
  if (total === 0) {
    const none = document.createElement('span');
    none.className = 'hand-piece';
    none.style.color = 'var(--text-muted)';
    none.textContent = 'なし';
    el.appendChild(none);
  }
  return el;
}

function renderBoard(board: Board, currentMove: Move | null): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'board-wrapper';

  // Column labels (9..1 left-to-right).
  const colLabels = document.createElement('div');
  colLabels.className = 'col-labels';
  for (let i = 9; i >= 1; i--) {
    const c = document.createElement('div');
    c.textContent = String(i);
    colLabels.appendChild(c);
  }
  wrapper.appendChild(colLabels);

  // Board grid.
  const grid = document.createElement('div');
  grid.className = 'board';

  const dest =
    currentMove && currentMove.kind !== 'terminator' ? currentMove.to : null;
  const from =
    currentMove && currentMove.kind === 'normal' ? currentMove.from : null;

  // r iterates 0..8 (row 1..9 top to bottom); c iterates 8..0 (col 9..1).
  for (let r = 0; r < 9; r++) {
    for (let c = 8; c >= 0; c--) {
      const piece = board.grid[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell';
      const col = c + 1;
      const row = r + 1;
      if (dest && dest.col === col && dest.row === row) cell.classList.add('dest');
      if (from && from.col === col && from.row === row) cell.classList.add('from');
      if (piece) {
        const span = document.createElement('span');
        span.className = `piece ${piece.player}`;
        if (piece.promoted) span.classList.add('promoted');
        span.textContent = pieceChar(piece);
        cell.appendChild(span);
      } else {
        cell.classList.add('empty');
      }
      grid.appendChild(cell);
    }
  }
  wrapper.appendChild(grid);

  // Row labels (一..九 top-to-bottom).
  const rowLabels = document.createElement('div');
  rowLabels.className = 'row-labels';
  const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  for (const k of KANJI) {
    const d = document.createElement('div');
    d.textContent = k;
    rowLabels.appendChild(d);
  }
  wrapper.appendChild(rowLabels);

  return wrapper;
}

function renderControls(p: KifuPayload): HTMLElement {
  const ctl = document.createElement('div');
  ctl.className = 'controls';
  const total = p.moves.length;

  const btn = (label: string, onClick: () => void, disabled = false) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };

  ctl.appendChild(btn('⏮', () => setIndex(0), state.currentIndex === 0));
  ctl.appendChild(btn('←', () => setIndex(state.currentIndex - 1), state.currentIndex === 0));

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(total);
  slider.value = String(state.currentIndex);
  slider.addEventListener('input', () => setIndex(parseInt(slider.value, 10)));
  ctl.appendChild(slider);

  const ind = document.createElement('span');
  ind.className = 'move-indicator';
  ind.textContent = `${state.currentIndex} / ${total}`;
  ctl.appendChild(ind);

  ctl.appendChild(
    btn('→', () => setIndex(state.currentIndex + 1), state.currentIndex === total),
  );
  ctl.appendChild(btn('⏭', () => setIndex(total), state.currentIndex === total));
  return ctl;
}

function moveNotation(m: Move): string {
  if (m.kind === 'terminator') return m.label;
  const colChar = '０１２３４５６７８９'[m.to.col];
  const rowChar = '〇一二三四五六七八九'[m.to.row];
  const promotedPieceChar = PIECE_CHAR_PROMOTED[m.kind === 'normal' ? m.piece : m.piece];
  const unpromotedPieceChar = PIECE_CHAR_UNPROMOTED[m.kind === 'normal' ? m.piece : m.piece];
  const piece =
    m.kind === 'normal' && m.wasPromoted ? promotedPieceChar : unpromotedPieceChar;
  const suffix =
    m.kind === 'drop'
      ? '打'
      : m.kind === 'normal' && m.promote
      ? '成'
      : '';
  const prefix = m.player === 'sente' ? '☗' : '☖';
  return `${prefix}${colChar}${rowChar}${piece}${suffix}`;
}

function renderCurrentMove(p: KifuPayload): HTMLElement {
  const el = document.createElement('p');
  el.className = 'current-move';
  if (state.currentIndex === 0) {
    el.textContent = '開始局面';
  } else {
    const m = p.moves[state.currentIndex - 1];
    el.textContent = `${state.currentIndex}手目 ${moveNotation(m)}`;
  }
  return el;
}

function renderComment(p: KifuPayload): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'comment-wrap';

  const header = document.createElement('div');
  header.className = 'comment-header';
  const title = document.createElement('span');
  title.textContent = `コメント（${state.currentIndex === 0 ? '開始局面' : state.currentIndex + '手目'}）`;
  header.appendChild(title);
  const status = document.createElement('span');
  status.className = 'comment-status';
  header.appendChild(status);
  wrap.appendChild(header);

  const ta = document.createElement('textarea');
  ta.className = 'comment-textarea';
  ta.rows = 3;
  ta.placeholder = 'この局面のコメント（保存: Cmd/Ctrl+S またはフォーカスを外す）';
  const existing = p.comments.find(([i]) => i === state.currentIndex)?.[1] ?? [];
  ta.value = existing.join('\n');
  const originalValue = ta.value;

  const save = () => {
    if (ta.value === originalValue) return;
    vscode.postMessage({
      type: 'saveComment',
      stateIndex: state.currentIndex,
      lines: ta.value === '' ? [] : ta.value.split('\n'),
    });
    status.textContent = '保存しました';
    status.classList.add('saved');
    setTimeout(() => {
      status.textContent = '';
      status.classList.remove('saved');
    }, 1500);
  };

  ta.addEventListener('blur', save);
  ta.addEventListener('keydown', (e) => {
    const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's';
    if (isSave) {
      e.preventDefault();
      save();
    }
    // Prevent board keyboard shortcuts from firing while editing.
    e.stopPropagation();
  });
  ta.addEventListener('focus', () => {
    editing.commentFocused = true;
  });
  ta.addEventListener('blur', () => {
    editing.commentFocused = false;
  });
  wrap.appendChild(ta);
  return wrap;
}

function renderMoveList(p: KifuPayload): HTMLElement {
  const list = document.createElement('div');
  list.className = 'move-list';

  const addItem = (idx: number, label: string) => {
    const item = document.createElement('div');
    item.className = 'move-item';
    if (idx === state.currentIndex) item.classList.add('active');
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = idx === 0 ? '—' : `${idx}.`;
    const txt = document.createElement('span');
    txt.textContent = label;
    item.appendChild(num);
    item.appendChild(txt);
    item.addEventListener('click', () => setIndex(idx));
    item.addEventListener('dblclick', () => {
      vscode.postMessage({ type: 'jumpToMove', moveIndex: idx });
    });
    list.appendChild(item);
  };

  addItem(0, '開始局面');
  for (let i = 0; i < p.moves.length; i++) {
    addItem(i + 1, moveNotation(p.moves[i]));
  }
  return list;
}

function setIndex(i: number): void {
  if (!state.payload) return;
  const max = state.payload.moves.length;
  const clamped = Math.max(0, Math.min(i, max));
  if (clamped === state.currentIndex) return;
  state.currentIndex = clamped;
  persist();
  render();
}

// ---------- Message handling ----------

let pendingPayload: KifuPayload | null = null;

function applyPayload(payload: KifuPayload): void {
  state.payload = payload;
  if (state.currentIndex > payload.moves.length) {
    state.currentIndex = payload.moves.length;
  }
  persist();
  render();
}

window.addEventListener('message', (ev: MessageEvent<ExtensionToWebview>) => {
  const msg = ev.data;
  if (msg.type === 'load' || msg.type === 'update') {
    if (editing.commentFocused) {
      pendingPayload = msg.payload;
      return;
    }
    applyPayload(msg.payload);
  }
});

// When the comment textarea loses focus, flush any payload that arrived while
// it was active.
document.addEventListener(
  'focusout',
  (ev) => {
    const t = ev.target as HTMLElement | null;
    if (t && t.classList.contains('comment-textarea') && pendingPayload) {
      const p = pendingPayload;
      pendingPayload = null;
      // Let the textarea blur handler run first (it updates commentFocused).
      queueMicrotask(() => applyPayload(p));
    }
  },
  true,
);

// ---------- Keyboard ----------

window.addEventListener('keydown', (e) => {
  if (!state.payload) return;
  if (e.target instanceof HTMLInputElement) return;
  switch (e.key) {
    case 'ArrowRight':
    case 'l':
      setIndex(state.currentIndex + 1);
      break;
    case 'ArrowLeft':
    case 'h':
      setIndex(state.currentIndex - 1);
      break;
    case 'Home':
    case 'g':
      setIndex(0);
      break;
    case 'End':
    case 'G':
      setIndex(state.payload.moves.length);
      break;
  }
});

// Signal the extension we are ready to receive the initial payload.
vscode.postMessage({ type: 'ready' });
render();
