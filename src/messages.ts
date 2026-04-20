// Message types exchanged between the extension host and the webview.

import { Board, Move } from './shogi';

export interface KifuPayload {
  header: Record<string, string>;
  moves: Move[];
  // Serialized list of board states (length = moves.length + 1).
  states: Board[];
  // Map entries as [stateIndex, commentLines[]].
  comments: Array<[number, string[]]>;
  warnings: string[];
  fileName: string;
  // True when gote (上手) makes the first move (handicap games).
  goteMovesFirst: boolean;
  // Display names for each side, sourced from 先手/後手 or 下手/上手.
  playerLabels: { sente: string | null; gote: string | null };
  // Source line numbers (1-based) for each move.
  moveLineNumbers: number[];
}

export type ExtensionToWebview =
  | { type: 'load'; payload: KifuPayload }
  | { type: 'update'; payload: KifuPayload };

export type WebviewToExtension =
  | { type: 'ready' }
  | { type: 'jumpToMove'; moveIndex: number }
  | {
      // Replace the comment lines attached to a given state index.
      // `lines` are raw comment text WITHOUT the leading "*".
      type: 'saveComment';
      stateIndex: number;
      lines: string[];
    };
