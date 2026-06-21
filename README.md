# Sensorium

インタラクティブ体験の実現性検証＋機材提案 Web アプリ。設計は `docs/`（[DESIGN_OVERVIEW.md](docs/DESIGN_OVERVIEW.md) / [OVERVIEW_PLAIN.md](docs/OVERVIEW_PLAIN.md) / ADR）と `CONTEXT.md` を参照。

## モノレポ構成（pnpm workspaces）

- `packages/shared` — Zod スキーマ。型と seed 検証の単一真実（フレームワーク非依存）。
- `packages/engine` — 純粋 TS の決定論エンジン。`evaluate(spec, equipment) → EvaluateResult`。
- `data/` — 機材・検出法・次元・干渉の seed（ユーザー編集可）。

## 開発

```sh
pnpm install
pnpm test        # vitest（seed 検証 ＋ engine ゴールデンテスト）
pnpm typecheck   # tsc --noEmit
pnpm eval        # 固定シナリオで入力→機材案を一覧表示
```

### 評価 CLI

任意の構想をコマンドラインから検証する。

```sh
pnpm cli -- -p hands --users 1 --responsiveness tight --lighting dark --budget 300000 --frontier
pnpm cli -- -p step --area 20 --users 6 --budget 1500000 --discrimination zoned
pnpm cli -- --help     # 全オプション
pnpm cli -- -p hands --json   # 生の Result を JSON 出力
```

### 自然言語入口（pnpm ask）

自由文を渡すと Claude が InteractionSpec を構造抽出し、そのまま評価する（論点Cの入口）。
要 `ANTHROPIC_API_KEY`。Claude は現象・面積・制約まで抽出し、機材選定はしない（エンジン専任）。

```sh
pnpm ask "踏むと光る床、直径10mの円形、20人くらい乗る"
pnpm ask "暗い会場で手を振ると反応、キオスク、予算20万"
```

## 現状の縦切り

「踏んだら反応する床」（step 現象 → 感圧マット）が通る最小パイプライン。
成立ゲート → 必要枚数のタイル化 → area/capacity/latency/budget の Condition 算出まで。
spatial（カメラ＋DetectionMethod）、Pareto 順位付け、MountPlan 幾何、Claude proxy は後続。
