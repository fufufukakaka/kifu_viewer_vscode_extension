// Shogi board model + move application.
// Coordinates use KIF notation: col 1..9 (right-to-left from sente view),
// row 1..9 (top-to-bottom). Internal arrays are 0-indexed: grid[row-1][col-1].

export type PieceKind = 'P' | 'L' | 'N' | 'S' | 'G' | 'B' | 'R' | 'K';
export type Player = 'sente' | 'gote';

export interface Piece {
  kind: PieceKind;
  player: Player;
  promoted: boolean;
}

export type Hand = Partial<Record<PieceKind, number>>;

export interface Board {
  // grid[r][c]: r in 0..8 = row 1..9 (top to bottom); c in 0..8 = col 1..9.
  grid: (Piece | null)[][];
  hands: { sente: Hand; gote: Hand };
}

export interface NormalMove {
  kind: 'normal';
  player: Player;
  from: { col: number; row: number };
  to: { col: number; row: number };
  piece: PieceKind;
  promote: boolean; // does this move promote the piece
  wasPromoted: boolean; // was the piece already promoted before this move
  capture: { kind: PieceKind; promoted: boolean } | null;
  sameAsPrev: boolean; // used "同" notation
  raw: string;
}

export interface DropMove {
  kind: 'drop';
  player: Player;
  to: { col: number; row: number };
  piece: PieceKind;
  raw: string;
}

export interface Terminator {
  kind: 'terminator';
  player: Player; // the player whose turn it was (losing side for resign)
  label: string; // e.g. 投了, 詰み, 千日手, 持将棋
  raw: string;
}

export type Move = NormalMove | DropMove | Terminator;

export function emptyBoard(): Board {
  const grid: (Piece | null)[][] = [];
  for (let r = 0; r < 9; r++) {
    const row: (Piece | null)[] = [];
    for (let c = 0; c < 9; c++) row.push(null);
    grid.push(row);
  }
  return { grid, hands: { sente: {}, gote: {} } };
}

function setPiece(b: Board, col: number, row: number, piece: Piece | null): void {
  b.grid[row - 1][col - 1] = piece;
}

function getPiece(b: Board, col: number, row: number): Piece | null {
  return b.grid[row - 1][col - 1];
}

// Standard 平手 initial position.
export function initialBoard(): Board {
  const b = emptyBoard();
  const backRank: PieceKind[] = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
  for (let c = 0; c < 9; c++) {
    setPiece(b, 9 - c, 1, { kind: backRank[c], player: 'gote', promoted: false });
  }
  setPiece(b, 2, 2, { kind: 'B', player: 'gote', promoted: false });
  setPiece(b, 8, 2, { kind: 'R', player: 'gote', promoted: false });
  for (let c = 1; c <= 9; c++) {
    setPiece(b, c, 3, { kind: 'P', player: 'gote', promoted: false });
  }
  for (let c = 0; c < 9; c++) {
    setPiece(b, 9 - c, 9, { kind: backRank[c], player: 'sente', promoted: false });
  }
  setPiece(b, 2, 8, { kind: 'R', player: 'sente', promoted: false });
  setPiece(b, 8, 8, { kind: 'B', player: 'sente', promoted: false });
  for (let c = 1; c <= 9; c++) {
    setPiece(b, c, 7, { kind: 'P', player: 'sente', promoted: false });
  }
  return b;
}

// Map a 手合割 header value to the set of squares on gote's (上手) side that
// should be emptied from the hirate initial position. Returns null if the
// handicap name is not recognized. For handicap games 上手 (gote/top) is the
// side giving the handicap, so pieces are removed from rows 1 and 2.
export function handicapRemovedSquares(
  handicapName: string,
): Array<{ col: number; row: number }> | null {
  const name = handicapName.trim();
  // Listed longest first so "飛香落ち" is not swallowed by "香落ち".
  const map: Record<string, Array<{ col: number; row: number }>> = {
    平手: [],
    '香落ち': [{ col: 1, row: 1 }],
    '左香落ち': [{ col: 1, row: 1 }],
    '右香落ち': [{ col: 9, row: 1 }],
    '角落ち': [{ col: 2, row: 2 }],
    '飛車落ち': [{ col: 8, row: 2 }],
    '飛香落ち': [
      { col: 8, row: 2 },
      { col: 1, row: 1 },
    ],
    '二枚落ち': [
      { col: 8, row: 2 },
      { col: 2, row: 2 },
    ],
    '四枚落ち': [
      { col: 8, row: 2 },
      { col: 2, row: 2 },
      { col: 1, row: 1 },
      { col: 9, row: 1 },
    ],
    '六枚落ち': [
      { col: 8, row: 2 },
      { col: 2, row: 2 },
      { col: 1, row: 1 },
      { col: 9, row: 1 },
      { col: 2, row: 1 },
      { col: 8, row: 1 },
    ],
    '八枚落ち': [
      { col: 8, row: 2 },
      { col: 2, row: 2 },
      { col: 1, row: 1 },
      { col: 9, row: 1 },
      { col: 2, row: 1 },
      { col: 8, row: 1 },
      { col: 3, row: 1 },
      { col: 7, row: 1 },
    ],
    '十枚落ち': [
      { col: 8, row: 2 },
      { col: 2, row: 2 },
      { col: 1, row: 1 },
      { col: 9, row: 1 },
      { col: 2, row: 1 },
      { col: 8, row: 1 },
      { col: 3, row: 1 },
      { col: 7, row: 1 },
      { col: 4, row: 1 },
      { col: 6, row: 1 },
    ],
  };
  return map[name] ?? null;
}

export function buildHandicapBoard(handicapName: string): Board | null {
  const removed = handicapRemovedSquares(handicapName);
  if (!removed) return null;
  const b = initialBoard();
  for (const sq of removed) setPiece(b, sq.col, sq.row, null);
  return b;
}

function cloneBoard(b: Board): Board {
  const grid = b.grid.map((row) => row.map((p) => (p ? { ...p } : null)));
  return {
    grid,
    hands: {
      sente: { ...b.hands.sente },
      gote: { ...b.hands.gote },
    },
  };
}

export function applyMove(b: Board, m: Move): Board {
  const nb = cloneBoard(b);
  if (m.kind === 'terminator') return nb;

  if (m.kind === 'drop') {
    const hand = nb.hands[m.player];
    const remaining = (hand[m.piece] ?? 0) - 1;
    if (remaining < 0) {
      throw new Error(
        `drop failed: ${m.player} has no ${m.piece} in hand (move: ${m.raw})`,
      );
    }
    if (remaining === 0) delete hand[m.piece];
    else hand[m.piece] = remaining;
    setPiece(nb, m.to.col, m.to.row, {
      kind: m.piece,
      player: m.player,
      promoted: false,
    });
    return nb;
  }

  // normal move
  const fromPiece = getPiece(nb, m.from.col, m.from.row);
  if (!fromPiece) {
    throw new Error(
      `move failed: empty source square ${m.from.col}${m.from.row} (move: ${m.raw})`,
    );
  }
  const captured = getPiece(nb, m.to.col, m.to.row);
  if (captured) {
    const hand = nb.hands[m.player];
    hand[captured.kind] = (hand[captured.kind] ?? 0) + 1;
  }
  setPiece(nb, m.from.col, m.from.row, null);
  setPiece(nb, m.to.col, m.to.row, {
    kind: fromPiece.kind,
    player: m.player,
    promoted: fromPiece.promoted || m.promote,
  });
  return nb;
}

// Build the full sequence of boards: states[i] = board AFTER move i has been applied.
// states[0] = initial board (0 moves applied).
export function buildStates(initial: Board, moves: Move[]): Board[] {
  const states: Board[] = [initial];
  let current = initial;
  for (const m of moves) {
    current = applyMove(current, m);
    states.push(current);
  }
  return states;
}

export const PIECE_CHAR_UNPROMOTED: Record<PieceKind, string> = {
  P: '歩',
  L: '香',
  N: '桂',
  S: '銀',
  G: '金',
  B: '角',
  R: '飛',
  K: '玉',
};

export const PIECE_CHAR_PROMOTED: Record<PieceKind, string> = {
  P: 'と',
  L: '杏',
  N: '圭',
  S: '全',
  G: '金', // gold doesn't promote; keep same char
  B: '馬',
  R: '龍',
  K: '玉',
};

export function pieceChar(p: Piece): string {
  return p.promoted ? PIECE_CHAR_PROMOTED[p.kind] : PIECE_CHAR_UNPROMOTED[p.kind];
}
