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

### 機材取込: DigiKey（pnpm ingest:digikey）

`api-distributor` アダプタ（ADR-0002）。キーワードで DigiKey を引き、生カタログを Claude が
Equipment envelope へ写像して **`data/candidates.ingest.json` に `status:candidate` で保存**する。
エンジンは active のみ読むので、取り込んでも**人レビューで昇格するまで成立判定には入らない**（候補ゲート）。

```sh
pnpm ingest:digikey "ultrasonic distance sensor" --limit 5
pnpm ingest:digikey "PIR motion sensor" --out data/candidates.ingest.json
pnpm ingest:digikey --fixture <生製品JSON>   # DigiKey 認証なしで写像だけ検証
```

要 `ANTHROPIC_API_KEY` ＋ DigiKey の OAuth キー（環境変数）:

| 変数 | 既定 | 用途 |
| --- | --- | --- |
| `DIGIKEY_CLIENT_ID` / `DIGIKEY_CLIENT_SECRET` | （必須） | developer.digikey.com で発行する Product Information API キー |
| `DIGIKEY_API_BASE` | `https://api.digikey.com` | サンドボックスに向けるなら上書き |
| `DIGIKEY_LOCALE_SITE` / `_LANGUAGE` / `_CURRENCY` | `US` / `en` / `USD` | 検索ロケール・通貨 |

法務姿勢（ADR-0002）: **出典付き・on-demand・非ミラー**。取込件数は既定5・上限25でキャップし、
各候補に `source`（adapter / distributor / sourceUrl / fetchedAt / verify）を必ず付す。
実行前に DigiKey の User Agreement（保存・レート規約）を確認すること。

## 現状の縦切り

通っているパイプライン:

- **step（感圧マット）** — 成立ゲート → 必要枚数のタイル化 → area/capacity/latency/budget の Condition → MountPlan 幾何（タイル敷設）まで全通し。
- **spatial（カメラ × DetectionMethod）** — ハード×検出ソフトの互換ペアを合成し、解像・metrics・Condition を算出して候補化。
- **Pareto フロンティア** — 5 軸の被支配案を消去する順位付け（CLI `--frontier`）。
- **Claude 自然言語入口** — 自由文 → InteractionSpec の構造抽出（`pnpm ask`）。
- **機材取込 api-distributor（DigiKey）** — キーワード検索 → Claude 写像 → `status:candidate` で候補ファイルへ（`pnpm ingest:digikey`）。

後続: spatial の MountPlan 幾何（カメラ被覆 / FOV）、audio・touch の DetectionMethod 経路、
取込候補の人レビュー昇格フロー、flat-file / url-extract アダプタ。
