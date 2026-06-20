# FeasiSense 設計概観（図解）

> インタラクティブ体験の **実現性検証 ＋ 機材提案** Web アプリ。
> 「成立する／しない」の○×ではなく、**成立条件（operating envelope）＋トレードオフ付き機材案** を返す。
> 詳細な個別判断は `docs/adr/`、用語は `CONTEXT.md` を参照。これはそれらを一望する1枚。

---

## 1. 一番大事な原則 — Claude は両端だけ、計算はエンジン

計算はすべて決定論的ルールエンジンが持つ。Claude は「入口（読み取り）」と「出口（文章化）」のみ。
だから結果は再現可能で、全数字を追跡できる。

```mermaid
flowchart LR
    A["企画書<br/>PDF / slide / Word"] --> B

    subgraph EDGE_IN["入口 — Claude"]
        B["読み取り<br/>NL → InteractionSpec"]
    end

    subgraph CORE["中身 — 決定論エンジン（Claude 不在）"]
        C["必要現象を洗い出す"]
        D["機材案を組む<br/>成立ゲート → Pareto"]
        E["設置計画を解く<br/>MountPlan 幾何"]
        C --> D --> E
    end

    subgraph EDGE_OUT["出口 — Claude"]
        F["文章化<br/>固定6セクション<br/>＋数値照合ゲート"]
    end

    B --> C
    E --> F
    F --> G["レポート<br/>markdown / PDF"]

    style CORE fill:#e8f0fe,stroke:#4285f4
    style EDGE_IN fill:#fce8e6,stroke:#ea4335
    style EDGE_OUT fill:#fce8e6,stroke:#ea4335
```

---

## 2. データの流れ（エンドツーエンド）

```mermaid
flowchart TD
    P["企画書"] -->|Claude 読込| SPEC["Project = InteractionSpec[]<br/>各項目に provenance<br/>stated / inferred / assumed"]
    SPEC --> PH["必要な SensedPhenomenon<br/>人体 / 物体 / 力接触 / 空間近接 / 運動 / 環境 / 位置回転"]
    PH --> CH["現象ごとに Channel"]

    CH --> GATE{"成立ゲート<br/>精度・面積・遅延・環境を<br/>満たす?"}
    GATE -->|No| FAIL["落選案も保持<br/>『閾値をこう動かせば入る』<br/>= operating envelope"]
    GATE -->|Yes| PARETO["順位付け（Pareto）<br/>被支配案を消し 2〜4案<br/>最安 / 最堅牢 …"]

    PARETO --> MOUNT["MountPlan を解く<br/>h・俯角・台数・redundancy"]
    FAIL --> REPORT
    MOUNT --> REPORT["出口 — Claude が文章化<br/>固定6セクション<br/>数値は Result と機械照合"]
    REPORT --> OUT["レポート"]

    style GATE fill:#fff3cd,stroke:#ff9800
    style PARETO fill:#e8f0fe,stroke:#4285f4
    style REPORT fill:#fce8e6,stroke:#ea4335
```

---

## 3. データモデル

```mermaid
classDiagram
    class Project {
        +InteractionSpec[] specs
    }
    class InteractionSpec {
        +SensedPhenomenon[] phenomena
        +制約（area, capacity, budget…）
        +provenance per field
    }
    class SensedPhenomenon {
        +種別（人体/物体/力接触…）
        +ハード要求（precision, latency…）
    }
    class SensingChannel {
        +Role[] roles
        +bool isPrimary  %% 主Channel
    }
    class Setup {
        +anchor sense（差別化の主役）
        +Channel ごとの機材
        +Pareto ラベル（最安/最堅牢…）
    }
    class Equipment {
        +capability envelope
        +price
        +sensorClass
        +ユーザー編集可
    }
    class DetectionMethod {
        +検出ソフト
    }
    class Condition {
        +dimension
        +operator, threshold, currentValue
        +status（hardThreshold/softMargin）
        +rationale, derivedFrom, severity
    }
    class MountPlan {
        +h（吊り高さ）
        +俯角 θ
        +台数, redundancy
    }
    class InterferenceRule {
        +sensingMethod タグ間の干渉
    }

    Project "1" o-- "*" InteractionSpec
    InteractionSpec "1" o-- "*" SensedPhenomenon
    SensedPhenomenon "1" -- "1" SensingChannel
    InteractionSpec "1" --> "*" Setup : エンジンが生成
    Setup "1" o-- "*" SensingChannel
    SensingChannel "1" --> "*" Equipment : role を埋める
    Equipment "1" -- "0..1" DetectionMethod : sense ペア
    Setup "1" --> "*" Condition : 評価結果
    Setup "1" --> "1" MountPlan
    Setup ..> InterferenceRule : Channel 間で適用
```

---

## 4. 機材案の組み方 — 成立ゲート → Pareto → アンカー

### 2段構え

```mermaid
flowchart TD
    IN["現象ごとの候補センサー<br/>（人体カメラ / 光電 / 測距 /<br/>感圧マット / レーダー …）"]
    IN --> S1

    subgraph S1["段1 — 成立ゲート（ハード制約）"]
        G["envelope が要求を満たすか<br/>精度・面積・遅延・環境"]
    end
    G -->|不成立| KEEP["捨てず Condition で保持<br/>『この閾値を動かせば入る』"]
    G -->|成立| S2

    subgraph S2["段2 — 順位付け（多軸 Pareto）"]
        AX["軸: cost / precision-margin /<br/>latency-margin /<br/>robustness・occlusion / install"]
        AX --> DROP["被支配案を隠す<br/>（全軸で他に負ける案）"]
        DROP --> SET["Pareto 2〜4案<br/>＋既定ソートのレンズ<br/>cost-first / robustness-first"]
    end

    style S1 fill:#fff3cd,stroke:#ff9800
    style S2 fill:#e8f0fe,stroke:#4285f4
```

### アンカー = 案ごとに変える「主役機材」

主 Channel（最もきつい現象）だけ機材を変えて差別化。残りは固定。

```mermaid
flowchart LR
    subgraph A案["深度カメラ案"]
        A1["手振り Ch（主・アンカー）<br/><b>深度カメラ</b>"]
        A2["床 Ch（固定）<br/>感圧マット"]
    end
    subgraph B案["LiDAR案"]
        B1["手振り Ch（主・アンカー）<br/><b>LiDAR</b>"]
        B2["床 Ch（固定）<br/>感圧マット"]
    end
    subgraph C案["レーダー案"]
        C1["手振り Ch（主・アンカー）<br/><b>mmWave レーダー</b>"]
        C2["床 Ch（固定）<br/>感圧マット"]
    end
    note["主役1点だけ動かす<br/>→ 因果が読める<br/>『LiDAR にしたら強いが高い』"]

    style A1 fill:#e8f0fe,stroke:#4285f4
    style B1 fill:#e8f0fe,stroke:#4285f4
    style C1 fill:#e8f0fe,stroke:#4285f4
```

---

## 5. 設置計画（MountPlan）の幾何

センサーを高さ h・俯角 θ で吊ると、床に **台形（キーストン）** の検出範囲ができる。
エンジンは「この床面積を検出したい」から逆に (h, θ) と台数を解く。

```
        センサー ●  高さ h、俯角 θ
                /|\
               / | \  縦視野角 αv
              /  |  \
   ──────────────────────── 床
         近端  軸  遠端
          └────┬────┘
        台形の検出範囲（保証は内接矩形）
```

```mermaid
flowchart TD
    REQ["検出したい床面積"] --> LOOP

    subgraph LOOP["θ を 5°〜75° / 1°刻みで走査"]
        H["各 θ で面積が収まる h を解く"]
        H --> CK{"全制約を満たす?<br/>①作動レンジ dmin–dmax<br/>②最遠点 precision（距離²劣化）<br/>③すれ角 ≧ 20°（要キャリブ）<br/>④設置高さ上限"}
    end

    CK -->|Yes| PICK["precision-margin 最大<br/>（or 高さ最小）を選択"]
    CK -->|No, 1台で無理| TILE["グリッドでタイル配置<br/>重なり率 = redundancy<br/>= occlusion 耐性 ↔ 台数(コスト)"]
    PICK --> RPT["台形を内接矩形で保証報告<br/>（過大約束しない）"]
    TILE --> RPT

    style CK fill:#fff3cd,stroke:#ff9800
```

---

## 6. What-if のラウンドトリップ（サーバ権威）

計算はサーバ。クライアントは Spec をいじって往復させ、結果を並べて比較。

```mermaid
sequenceDiagram
    participant U as TD（ブラウザ）
    participant C as クライアント<br/>(Inertia/React)
    participant S as サーバ<br/>(AdonisJS)
    participant E as エンジン<br/>(純関数)
    participant L as LRU キャッシュ

    U->>C: Spec を編集（スライダ等）
    Note over C: 200ms デバウンス<br/>先行リクエストは AbortController で破棄
    C->>S: POST /evaluate（InteractionSpec 全量）
    S->>L: hash(canonical(spec)) : equipmentDBRevision
    alt キャッシュヒット
        L-->>S: Result（再計算なし）
    else ミス
        S->>E: evaluate(spec, equipmentDB)
        E-->>S: フル Result
        S->>L: 格納
    end
    S-->>C: フル Result（Condition[] + Setup[] + MountPlan）
    Note over C: 手元の前回 Result と差分計算<br/>ハイライト描画
    C-->>U: ライブ更新
    U->>C: ピン留め（{spec, result, label, pinnedAt} を保持）
    Note over C: スナップショット比較もクライアント側
```

> キャッシュキーに `equipmentDBRevision` を混ぜるのが肝。
> 機材DBを編集すると新リビジョンで別キーになり、古い結果を自然に陳腐化させる。

---

## 7. UI フロー

**入力方式（論点E）:** 入口は2系統＝チャット/自由テキスト ＋ 企画書アップロード。どちらも「種」。
**チャットは会話ログに条件を貯めない** ── 1メッセージ → 受付AIが **フォームへのパッチ（差分）** を生成 → フォームを書き換える（適用前に差分確認）。
**唯一の真実は構造化フォーム（InteractionSpec）**。What-if もレポートも全部フォーム相手。AI 書換項目は provenance=inferred/assumed、ユーザー修正で stated。ADR-0001「Claude は入口」の枠内（一発→反復になるだけ）。

```mermaid
flowchart LR
    subgraph IN["① 入力（チャット = フォーム操作子）"]
        I1["チャット / 自由テキスト<br/>＋ 企画書"] --> I2["受付AIがパッチ生成<br/>→ 差分確認 → フォーム書換"]
        I2 -. 追加の会話で精緻化 .-> I2
    end
    subgraph WS["② 検証ワークスペース（中心・2ペイン）"]
        L["左: Spec 編集<br/>= What-if 操作子"]
        R["右: [条件] [機材] タブ<br/>ライブ再計算<br/>ピン留めスナップショット比較"]
        L <--> R
    end
    subgraph RP["③ レポート"]
        O["Claude 生成<br/>固定6セクション<br/>markdown / PDF"]
    end
    IN --> WS --> RP
```

---

## 8. 技術スタック

```mermaid
flowchart TB
    subgraph MONO["pnpm モノレポ"]
        SH["packages/shared<br/>Zod スキーマ<br/>＝型・seed 検証の単一真実"]
        EN["packages/engine<br/>純粋 TS 決定論エンジン<br/>フレームワーク／ネット非依存"]
        APP["AdonisJS + Inertia(React)<br/>Lucid ORM / Ace コマンド /<br/>取込3アダプタ / Claude proxy"]
        SH --> EN
        SH --> APP
        EN --> APP
    end

    subgraph DATA["機材データ（出典付き・on-demand・非ミラー）"]
        ING["取込3アダプタ<br/>api-distributor(DigiKey主) /<br/>flat-file(CSV) / url-extract"]
        DB[("Equipment DB<br/>SQLite → Postgres<br/>候補→人レビュー→有効")]
        ING --> DB
    end

    APP --> DB

    style EN fill:#e8f0fe,stroke:#4285f4
    style SH fill:#d4edda,stroke:#28a745
```

---

## 参照

- 個別判断: `docs/adr/0001`〜`0005`
- 用語集・対話例: `CONTEXT.md`
- データシード: `data/*.seed.json`
