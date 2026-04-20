// KIF (Kakinoki) format parser.
// Focused on the subset needed for MVP: 平手 games, normal/drop/promotion
// moves, "同" notation, comments, and common terminators. Variations (変化)
// are ignored. Handicap openings (非平手) fall back to the standard initial
// position and surface a warning.

import {
  Board,
  DropMove,
  Move,
  NormalMove,
  PieceKind,
  Player,
  Terminator,
  buildHandicapBoard,
  initialBoard,
} from './shogi';

export interface ParsedKifu {
  header: Record<string, string>;
  moves: Move[];
  // Comments[i] = comment lines attached to state index i
  // (state 0 = initial position; state k after k-th move has been applied).
  comments: Map<number, string[]>;
  // Source line number (1-based) for each move, so editors can locate it.
  moveLineNumbers: number[];
  initial: Board;
  // True when 上手 (top / gote-side) makes the first move.
  // In 駒落ち (handicap) games 上手 plays first by convention.
  goteMovesFirst: boolean;
  // Display labels keyed by player. Populated from 先手/後手 or 下手/上手.
  playerLabels: { sente: string | null; gote: string | null };
  warnings: string[];
}

const FULLWIDTH_DIGITS = '０１２３４５６７８９';
const HALFWIDTH_DIGITS = '0123456789';
const KANJI_DIGITS = '〇一二三四五六七八九';

function parseColumnChar(ch: string): number | null {
  const fw = FULLWIDTH_DIGITS.indexOf(ch);
  if (fw >= 1) return fw;
  const hw = HALFWIDTH_DIGITS.indexOf(ch);
  if (hw >= 1) return hw;
  return null;
}

function parseRowChar(ch: string): number | null {
  const k = KANJI_DIGITS.indexOf(ch);
  if (k >= 1) return k;
  return null;
}

// Piece notation prefixes, longest first for greedy matching.
const PIECE_PREFIXES: ReadonlyArray<{
  str: string;
  kind: PieceKind;
  promoted: boolean;
}> = [
  { str: '成香', kind: 'L', promoted: true },
  { str: '成桂', kind: 'N', promoted: true },
  { str: '成銀', kind: 'S', promoted: true },
  { str: 'と', kind: 'P', promoted: true },
  { str: '杏', kind: 'L', promoted: true },
  { str: '圭', kind: 'N', promoted: true },
  { str: '全', kind: 'S', promoted: true },
  { str: '馬', kind: 'B', promoted: true },
  { str: '龍', kind: 'R', promoted: true },
  { str: '竜', kind: 'R', promoted: true },
  { str: '歩', kind: 'P', promoted: false },
  { str: '香', kind: 'L', promoted: false },
  { str: '桂', kind: 'N', promoted: false },
  { str: '銀', kind: 'S', promoted: false },
  { str: '金', kind: 'G', promoted: false },
  { str: '角', kind: 'B', promoted: false },
  { str: '飛', kind: 'R', promoted: false },
  { str: '玉', kind: 'K', promoted: false },
  { str: '王', kind: 'K', promoted: false },
];

function matchPiecePrefix(
  s: string,
  offset: number,
): { kind: PieceKind; promoted: boolean; len: number } | null {
  for (const p of PIECE_PREFIXES) {
    if (s.startsWith(p.str, offset)) {
      return { kind: p.kind, promoted: p.promoted, len: p.str.length };
    }
  }
  return null;
}

const TERMINATOR_LABELS = [
  '投了',
  '詰み',
  '中断',
  '千日手',
  '持将棋',
  '反則勝ち',
  '反則負け',
  '時間切れ',
  '入玉勝ち',
];

// Parse the move notation (after the leading "N " prefix, before " (00:00/...)").
// `prevDest` is the destination of the previous move (for "同").
function parseMoveText(
  text: string,
  moveNumber: number,
  prevDest: { col: number; row: number } | null,
  goteMovesFirst: boolean,
  raw: string,
): Move | null {
  const firstPlayer: Player = goteMovesFirst ? 'gote' : 'sente';
  const secondPlayer: Player = goteMovesFirst ? 'sente' : 'gote';
  const player: Player = moveNumber % 2 === 1 ? firstPlayer : secondPlayer;

  // Terminator?
  for (const label of TERMINATOR_LABELS) {
    if (text.startsWith(label)) {
      return { kind: 'terminator', player, label, raw };
    }
  }

  let idx = 0;
  let dest: { col: number; row: number };

  if (text.startsWith('同')) {
    if (!prevDest) {
      throw new Error(`"同" without previous move (move ${moveNumber}: ${raw})`);
    }
    dest = { ...prevDest };
    idx = 1;
    // Skip optional full-width space
    if (text[idx] === '　' || text[idx] === ' ') idx++;
  } else {
    const col = parseColumnChar(text[idx]);
    const row = parseRowChar(text[idx + 1]);
    if (col === null || row === null) {
      throw new Error(`cannot parse destination at move ${moveNumber}: ${raw}`);
    }
    dest = { col, row };
    idx += 2;
  }

  const pp = matchPiecePrefix(text, idx);
  if (!pp) {
    throw new Error(`cannot parse piece at move ${moveNumber}: ${raw}`);
  }
  idx += pp.len;

  let promote = false;
  if (text.startsWith('成', idx)) {
    promote = true;
    idx += 1;
  }
  // "不成" = explicit non-promotion; treat as not promoting.
  if (text.startsWith('不成', idx)) {
    promote = false;
    idx += 2;
  }

  if (text.startsWith('打', idx)) {
    const drop: DropMove = {
      kind: 'drop',
      player,
      to: dest,
      piece: pp.kind,
      raw,
    };
    return drop;
  }

  // Expect (cr) origin.
  const m = /^\((\d)(\d)\)/.exec(text.slice(idx));
  if (!m) {
    throw new Error(`cannot parse origin at move ${moveNumber}: ${raw}`);
  }
  const from = { col: parseInt(m[1], 10), row: parseInt(m[2], 10) };
  const move: NormalMove = {
    kind: 'normal',
    player,
    from,
    to: dest,
    piece: pp.kind,
    promote,
    wasPromoted: pp.promoted,
    capture: null, // computed later if needed
    sameAsPrev: text.startsWith('同'),
    raw,
  };
  return move;
}

export function parseKifu(text: string): ParsedKifu {
  const warnings: string[] = [];
  const header: Record<string, string> = {};

  // Pass 1: scan headers so the parser knows the handicap before moves start.
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.length === 0) continue;
    if (line.startsWith('*') || line.startsWith('#')) continue;
    if (line.startsWith('手数')) break;
    const colonIdx = line.indexOf('：');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      header[key] = value;
    }
  }

  const handicap = header['手合割'] ?? '平手';
  const handicapBoard = buildHandicapBoard(handicap);
  let initial: Board;
  if (handicapBoard) {
    initial = handicapBoard;
  } else {
    initial = initialBoard();
    warnings.push(
      `手合割 "${handicap}" は未対応のため平手の初期盤面で描画します`,
    );
  }
  const isHandicap = handicap !== '平手' && handicapBoard !== null;
  const goteMovesFirst = isHandicap;

  const playerLabels = {
    sente: header['先手'] ?? header['下手'] ?? null,
    gote: header['後手'] ?? header['上手'] ?? null,
  };

  // Pass 2: parse moves and comments.
  const moves: Move[] = [];
  const comments = new Map<number, string[]>();
  const moveLineNumbers: number[] = [];
  let inMoves = false;
  let prevDest: { col: number; row: number } | null = null;

  const addComment = (idx: number, line: string) => {
    const arr = comments.get(idx) ?? [];
    arr.push(line);
    comments.set(idx, arr);
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (line.length === 0) continue;

    if (line.startsWith('*')) {
      addComment(moves.length, line.slice(1));
      continue;
    }
    if (line.startsWith('#')) continue;

    if (!inMoves) {
      if (line.startsWith('手数')) {
        inMoves = true;
      }
      continue;
    }

    if (line.startsWith('変化')) {
      warnings.push(`variation at line ${i + 1} is ignored in MVP: ${line}`);
      break;
    }

    const m = /^\s*(\d+)\s+(\S.*?)\s*(\(\s*\d{1,2}:\d{2}\s*\/\s*\d{1,2}:\d{2}:\d{2}\s*\))?\s*$/.exec(
      line,
    );
    if (!m) continue;
    const moveNumber = parseInt(m[1], 10);
    const notation = m[2];

    const move = parseMoveText(notation, moveNumber, prevDest, goteMovesFirst, line);
    if (!move) continue;
    moves.push(move);
    moveLineNumbers.push(i + 1);
    if (move.kind === 'normal' || move.kind === 'drop') {
      prevDest = { ...move.to };
    }
  }

  return {
    header,
    moves,
    comments,
    moveLineNumbers,
    initial,
    goteMovesFirst,
    playerLabels,
    warnings,
  };
}
