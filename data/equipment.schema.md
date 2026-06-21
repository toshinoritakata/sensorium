# Equipment スキーマ

ユーザー編集可能な機材DBの1レコードの形。計算式の決定（CONTEXT.md / ADR-0001）から逆算した項目。
**共通ベース**＋**カテゴリ別 capability envelope** の二層。エンジンのルールはカテゴリ別。

各スペック値には `confidence`（high/med/low）と `note` を添える。価格・最新モデルなど変動値は `verify: true` を立て「要検証」とする。

## 共通ベース（全機材）

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | 一意ID（kebab-case） |
| `name` | string | 表示名 |
| `vendor` | string | メーカー |
| `rolesProvided` | enum[] | この機材が埋められる role: `sense` / `interface` / `compute` / `mount` |
| `sensingMethod` | tag[] | 物理方式タグ（InterferenceRule が参照）。例: `ir-structured-light`, `tof`, `lidar`, `passive-rgb`, `capacitive`, `ir-frame`, `acoustic-mic`, `acoustic-emit` |
| `servesModality` | enum[] | 対応モダリティ: `gesture` / `touch` / `voice` |
| `price` | { value, currency, asOf, verify } | 概算単価。`verify:true` は要検証 |
| `interface` | object | 接続仕様（下記）。設置可否・ケーブル取り回しに直結 |
| `powerW` | number | 消費電力(W)。恒久設置の電源容量・発熱・PoE給電枠の判定に使う |
| `computeNeed` | string | 必要処理リソースの目安（"midrange GPU PC" 等）。`sense` 機材が前提とする compute role の手がかり |
| `mountingNeed` | string | 設置要件（"ceiling/truss, fixed" 等） |
| `status` | enum | `active`（レビュー済み・判定に使用可）/ `candidate`（取込直後・要レビュー、判定に使わない）。CONTEXT.md candidate 参照 |
| `source` | object? | 取込メタ。`{ adapter: api-distributor/flat-file/url-extract, sourceUrl, distributor?, fetchedAt, verify }`。手動シードは null/`manual`。**出典付き・非ミラー**（ADR-0002） |

#### interface オブジェクト
| フィールド | 型 | 説明 |
|---|---|---|
| `type` | enum | `usb` / `ethernet` / `poe` / `xlr` / `i2c` / `hdmi` 等 |
| `spec` | string | 帯域規格（"USB3.2 Gen1 (5Gbps)" / "1000BASE-T" / "100BASE-T" 等） |
| `connector` | string | `USB-C` / `USB-A` / `RJ45` / `XLR` / `M12` 等 |
| `maxCableLength_m` | number | パッシブでの延長限界（USB ~3-5m, Ethernet/PoE ~100m）。超える設置はアクティブ延長/中継要 |
| `power` | enum | 給電方式: `bus-powered` / `poe` / `poe+` / `external-dc` / `phantom-48v` |

**整合フック（将来）**: ①`maxCableLength_m` < 設置距離 → mounting 条件に「延長対策要」。②`power:poe*` かつ `powerW` > PoE枠(PoE 15.4W / PoE+ 30W) → 「外部電源必須」。③恒久設置で Σ`powerW` → 電源容量・発熱の参考。データは今持つだけ、条件化は後でよい。

## カテゴリ別 envelope

### spatial（gesture: depth/lidar/rgb 系の **光学ハードウェア**）
**光学・物理特性のみ**を持つ。何を認識できるか（resolvableTargets / maxTrackedBodies）と推論レイテンシは DetectionMethod 側（下記）。`sense` role はこのハードウェア × DetectionMethod のペアで埋まる。

| フィールド | 型 | 参照する条件 |
|---|---|---|
| `fovH` `fovV` | deg | coverage（床射影の画角） |
| `usableRange` | [min,max] m | coverage（有効距離帯）, mount 最適化 |
| `typicalCoverageArea` | ㎡? | coverage（**経験値オーバーライド**。あれば床射影より優先） |
| `depthType` | enum | `tof` / `active-stereo` / `passive-stereo` / `lidar` / `none(rgb)` — DetectionMethod の互換判定に使う |
| `sensorLatencyMs` | ms | latency（**センサー＋転送のみ**。推論は DetectionMethod の addedLatencyMs） |
| `minLux` `maxLux` | lux | lighting |
| `sunlightOk` | bool | lighting（屋外可否） |
| `mountAdjustable` | { heightRange, tiltRange } | MountPlan 最適化の探索範囲 |

### DetectionMethod（検出手法 / ソフト・ミドルウェア）
ハードウェアと別エンティティ。`sense` role の実効能力を決める。compute role に乗る。

| フィールド | 型 | 説明 / 参照する条件 |
|---|---|---|
| `id` `name` `vendor` | string | — |
| `license` | { model: oss/commercial/bundled, price, verify } | budget（ソフトコスト） |
| `compatibleWith` | { depthType[]?, sensingMethod[]?, equipmentIds[]? } | どのハード方式/機種と組めるか。spatial は `depthType`、音声は `sensingMethod:["acoustic-mic"]` で指定。`equipmentIds` 指定時は固定ペア（Leap/ZED 等） |
| `providesTargets` | enum[] | precision。spatial: `presence`/`fullBody`/`limbs`/`hands`/`fingers`。音声: `voiceCommand`/`soundDirection`。ハード方式と合わせて実効値を確定 |
| `maxTrackedBodies` | int | capacity |
| `addedLatencyMs` | ms | latency（センサーに上乗せする推論レイテンシ） |
| `computeNeed` | string | compute role の GPU 要求（同時人数で増える旨も） |
| `sensingMethod` | tag[]? | ソフト由来の干渉が無ければ空。通常はハード側のタグを使う |

**ペア合成ルール（エンジン）**: `sense` の実効 envelope は
`resolvableTargets = providesTargets ∩ (depthType が許す範囲)`、
`maxTrackedBodies = min(ハード現実上限, DetectionMethod.maxTrackedBodies)`、
`latency = ハード.sensorLatencyMs + DetectionMethod.addedLatencyMs`。

### touch（タッチ・近接の sense 機材）
| フィールド | 型 | 参照する条件 |
|---|---|---|
| `maxSurface` | [w,h] m | coverage（タッチ面サイズ） |
| `multitouchPoints` | int | capacity（同時タッチ点） |
| `surfaceType` | string | precision/設置（ガラス/フィルム/IRフレーム等） |
| `latencyMs` | ms | latency |
| `proximityRange` | m? | 近接検出距離（任意） |

### audio（音声・音の sense 機材）
| フィールド | 型 | 参照する条件 |
|---|---|---|
| `pickupPattern` | string | 指向性（omni/cardioid/shotgun/array） |
| `effectiveRange` | m | coverage（収音距離） |
| `localizationCapable` | bool | soundDirection 解像可否（precision） |
| `noiseToleranceDb` | dB | noise（許容環境騒音 / 実効SNR） |
| `channels` | int | capacity/定位 |

### 工業用センサー系（industrial）
**直接出力**で粗い検出を担う。DetectionMethod なしで `sense` を埋める（信号が直接トリガー/値）。category と固有 envelope:

| category | 固有フィールド | sensedTarget |
|---|---|---|
| `presence-point` | `detectMode`(through-beam/retroreflective/diffuse/inductive/capacitive), `sensingDistance_m`, `minTargetSize_mm`, `responseTimeMs`, `output`(PNP/NPN/IO-Link/relay/analog) | objectPresence / zoneCrossing |
| `distance-1d` | `measureRange_m`[min,max], `beamAngle_deg`, `resolution_mm`, `responseTimeMs`, `output` | distance1d |
| `area-curtain` | `coverageW_m`, `coverageH_m`, `beamPitch_mm`(ゾーン分解能), `minDetectObject_mm`, `responseTimeMs`, `output` | zoneCrossing（平面内位置・粗いタッチレス） |
| `lidar-2d` | `range_m`, `scanAngle_deg`, `angularResolution_deg`, `scanRateHz`, `minDetectObject_mm`, `accuracy_mm`, `responseTimeMs`, `output` | zoneCrossing / presence / objectPresence / count（面を放射状に走査し面内座標を取る。破断有無だけの area-curtain と別物） |
| `pressure-mat` | `area_m2` or `dims_m`, `triggerForce_kg`, `zones`(single/multi), `responseTimeMs`, `output` | step / weight |
| `motion-pir` | `detectionRange_m`, `detectionAngle_deg`, `holdTimeMs`, `output` | motion / presence |
| `radar-presence` | `range_m`, `fov_deg`, `capabilities`[presence/distance/coarse-gesture/count], `responseTimeMs`, `output` | presence / distance1d / gesture(粗) / count |

共通: `responseTimeMs` は latency 条件に直接入る（推論レイテンシなし＝低遅延が強み）。`output` 形式は interface/compute（PLC/マイコン/IO）の手がかり。多くは複数台を配列して面/ゾーンを構成（coverage は台数前提）。

## 注記
- `compute` / `mount` だけを担う機材（PC、トラス金具等）は共通ベースのみで envelope を持たない。
- 1機材が複数 `servesModality` / `rolesProvided` を持ってよい（共有 role の二重計上回避に使う）。
- **DetectionMethod は任意**: リッチトラッキング系は必須、工業用センサー系は不要（直接出力）。
- sensedTargets 全体: `presence`/`fullBody`/`limbs`/`hands`/`fingers`（骨格系）＋`objectPresence`/`zoneCrossing`/`distance1d`/`step`/`weight`/`motion`/`count`（工業系）＋`voiceCommand`/`soundDirection`/`soundLevel`（音声系）。
