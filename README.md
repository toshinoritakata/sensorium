# FeasiSense

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
```

## 現状の縦切り

「踏んだら反応する床」（step 現象 → 感圧マット）が通る最小パイプライン。
成立ゲート → 必要枚数のタイル化 → area/capacity/latency/budget の Condition 算出まで。
spatial（カメラ＋DetectionMethod）、Pareto 順位付け、MountPlan 幾何、Claude proxy は後続。
