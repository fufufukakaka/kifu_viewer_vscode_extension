# Kifu Viewer

将棋の棋譜ファイル (`.kif`) を、Markdown プレビューのように**盤面プレビュー**として開ける VSCode 拡張機能です。一手ずつ進める・戻す・コメントを編集するといった操作が、エディタを離れずに行えます。

A VSCode extension that renders Shogi kifu (`.kif`) files as an interactive board, with move navigation and inline comment editing — similar in spirit to VSCode's built-in Markdown preview.

![Kifu Viewer screenshot — initial position](https://raw.githubusercontent.com/fufufukakaka/kifu_viewer_vscode_extension/main/.artifacts/kifu-viewer/01-initial.png)

## 主な機能 / Features

- 📄 **`.kif` ファイルを盤面として表示** — ヘッダー（先手/後手/棋戦/手合割/日時）、盤面、持ち駒を一画面に
- ⏮ ⏭ ← → **手順のナビゲーション** — ボタン・スライダー・キーボード（← → / h l / Home End / g G）
- 🔎 **移動元/移動先のハイライト** — 現在の一手がひと目で分かる
- ✍️ **コメントの編集と保存** — 局面ごとの `*` コメントを textarea で編集し、blur または Cmd/Ctrl+S で `.kif` に書き戻し
- 🎯 **手合割 (駒落ち) 対応** — 香落ち／左右香落ち／角落ち／飛車落ち／飛香落ち／二〜十枚落ち。上手先手の手番処理も自動
- 🔁 **ライブリロード** — `.kif` をテキストエディタで編集すると、プレビューが即座に追従
- 🖱 **手一覧のクリック** — 任意の手にジャンプ、ダブルクリックで元ファイルの該当行へフォーカス

## 使い方 / Usage

1. VSCode で `.kif` ファイルを開く
2. エディタタブ右上の **プレビューアイコン**（📖）をクリック、もしくは **コマンドパレット → `Kifu: Show Preview to the Side`**
3. → / ← キーで手順を進める／戻す、下部の textarea でコメント編集

### サポートしている KIF 仕様

- ヘッダー: `先手`, `後手`, `下手`, `上手`, `棋戦`, `手合割`, `開始日時` ほか `key：value` 形式すべて
- 指手表記: 通常移動 `２六歩(27)`、打 `２四歩打`、成 `８八角成(22)`、不成 `不成`、同 `同　歩(23)`、既成駒の移動 `７一と(81)` `３二成桂(33)` `２五龍(15)` `８二馬(91)`
- 終局: `投了`, `詰み`, `中断`, `千日手`, `持将棋`, `反則勝ち`, `反則負け`, `時間切れ`, `入玉勝ち`
- コメント: `*` で始まる行、任意箇所に複数行
- 文字コード: UTF-8（Shift-JIS はエディタ側で変換してから開いてください）

### 現バージョンの制限

- 分岐 (`変化：N手`) は解析せず、本譜のみ描画します
- 平手以外の手合割は初期盤面を駒落ちで構築しますが、上手手番の扱いを除けば特別な処理は行いません

## スクリーンショット / Screenshots

| 平手 初期局面 | 中盤 | 終局 (投了) |
| :---: | :---: | :---: |
| ![](https://raw.githubusercontent.com/fufufukakaka/kifu_viewer_vscode_extension/main/.artifacts/kifu-viewer/01-initial.png) | ![](https://raw.githubusercontent.com/fufufukakaka/kifu_viewer_vscode_extension/main/.artifacts/kifu-viewer/02-after-20.png) | ![](https://raw.githubusercontent.com/fufufukakaka/kifu_viewer_vscode_extension/main/.artifacts/kifu-viewer/03-end.png) |

| 二枚落ち 初期 | コメント編集 |
| :---: | :---: |
| ![](https://raw.githubusercontent.com/fufufukakaka/kifu_viewer_vscode_extension/main/.artifacts/kifu-viewer/p2-01-handicap-initial.png) | ![](https://raw.githubusercontent.com/fufufukakaka/kifu_viewer_vscode_extension/main/.artifacts/kifu-viewer/p2-04-comment-after-edit.png) |

## キーボードショートカット / Keybindings

| 操作 | キー |
| --- | --- |
| 次の手 | `→` / `l` |
| 前の手 | `←` / `h` |
| 開始局面 | `Home` / `g` |
| 最終局面 | `End` / `G` |
| コメント保存 | `Cmd+S` / `Ctrl+S`（textarea 内で） |

## ライセンス / License

MIT © 2026 fufufukakaka

## 貢献 / Contributing

Issue / PR は GitHub リポジトリでお待ちしています: <https://github.com/fufufukakaka/kifu_viewer_vscode_extension>
