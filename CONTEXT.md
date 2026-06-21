# Sensorium

インタラクティブコンテンツの構想を入力すると、技術的な**成立条件**を明確化し、トレードオフ付きの**機材案**を提案する Web アプリ。利用者はテクニカルディレクタ。○×採点ではなく「どの条件なら成立し、どの境界で破綻するか」を言語化することが価値。

**スコープの背骨は『人の動きが撮れるか』ではなく『あらゆる物理現象を検出できるか』**。入力は人体に限らず、物体・力/荷重・距離・ビーム横切り・環境変化などを含む。エンジンは「検出すべき現象(SensedPhenomenon)」を背骨に、人体カメラから光電センサ・ロードセル・測距・環境センサまで**センサー種別を横断**して機材案を出す。人体トラッキングは数ある検出領域の一つにすぎない。

## Language

**InteractionSpec**:
構造化された構想。必要な **SensedPhenomenon** 群＋面積・同時人数・必要精度・応答性・環境・恒久仮設などのパラメータ集合。エンジンへの唯一の入力。入力経路は3段階で同じ抽出ロジックに乗る: ①自然言語の記述 ②フォーム確認・修正 ③**企画書インジェスト（最終ゴール）**。いずれも Claude が抽出し provenance(stated/inferred/assumed) を付ける。
_Avoid_: 仕様, 要件定義

**企画書インジェスト（Proposal ingest）**:
最終ゴールの入力モード。PDF/スライド/Word 等の企画書を渡すと、Claude が中身を解析して1つ以上の InteractionSpec を抽出する（1つの企画書に複数の体験/展示が含まれうる→ **Project** = 複数 Spec の束）。抽出された各 Spec はフォームで確認・修正（candidate と同様、人が承認して確定）。欠落は provenance:assumed で埋めブロックしない。入口の Claude 役割の拡張であり、エンジン(決定論)とレポート(ナレーション専任)の役割分担は不変。**対応フォーマットはテキスト/Word を優先**、PDF/スライドの図表解析は後段。
_Avoid_: 提案書解析, ドキュメント取込

**provenance（素性: stated / inferred / assumed）**:
InteractionSpec の各項目が持つ出所。`stated`=TD が明記、`inferred`=Claude が文脈から推定、`assumed`=手がかりなく既定値で補完。エンジンは値を区別せず計算するが、UI はフォームで色分けし、`assumed` 項目に由来する Condition には「前提に依存」マーカーを伝播させる。欠落があってもブロックせず常にライブで走らせ、何が地に足つき何が仮定かを誠実に可視化するための仕組み。
_Avoid_: 信頼度, confidence

**Equipment**:
機材1点。共通ベース項目＋カテゴリ別の **capability envelope** を持つ。ユーザー編集可能な DB に格納。2系統ある: ①**リッチトラッキング系**（depth/lidar/rgb 等。骨格・手を解像、DetectionMethod とのペアで sense を埋める）②**工業用センサー系**（フォトセンサ・近接・測距・ライトカーテン・感圧・PIR・mmWaveレーダー等。粗い検出を直接出力し、DetectionMethod なしで sense を埋める）。後者は安い・堅牢・オクルージョンに強く walk-up 向き。
_Avoid_: デバイス, 機器

**工業用センサークラス**:
工業用センサー系 Equipment のカテゴリ群と、それが担う sensedTarget。`presence-point`(フォト/近接→objectPresence・zoneCrossing) / `distance-1d`(超音波・レーザー測距→distance1d) / `area-curtain`(ライトカーテン→平面内 zoneCrossing) / `pressure-mat`(感圧・ロードセル→step・weight) / `motion-pir`(PIR→motion・presence) / `radar-presence`(mmWave→presence・distance1d・粗い gesture・count)。InteractionSpec の sensedTargets はこれらに対応して `objectPresence / zoneCrossing / distance1d / step / weight / motion / count` を含む。これらは骨格系(`fullBody`/`hands`/`fingers`)とは別系統で並列に扱う。

**IngestionSource（取込ソース）**:
機材データを外部から取り込む経路。3アダプタに統一: ①`api-distributor`（DigiKey 主・Mouser 補。OAuth・パラメトリック。Omron 等メーカーも供給元として横断取得）②`flat-file`（CSV／Misumi・RS フラットファイル・手入力）③`url-extract`（任意の製品URLを fetch → Claude が仕様抽出）。3口とも出口は共通パイプライン「候補 → レビュー → 有効」。マッピング（カタログのバラバラな項目 → 自社 envelope）は **Claude 抽出＋人レビュー**（provenance の流儀と一致）。**法務: 出典付き・on-demand・非ミラー**。各API の User Agreement を実装前に確認する。
_Avoid_: スクレイパー, クローラ

**candidate（候補 / unverified）**:
IngestionSource で取り込まれた直後の Equipment の状態。エンジンの判定には使われず、TD のレビューで承認されて初めて有効化される。誤マッピング・欠損値がそのまま判定に入るのを防ぐ。confidence/provenance と同じ「地に足ついたものだけ信用する」流儀。

**Setup（機材案）**:
InteractionSpec を満たすための Equipment の構成1案で、**体験まるごと**＝全モダリティのスロットを埋めた、体験として成立する1構成。モダリティ単位では切らない（InterferenceRule を効かせるため）。全組み合わせは列挙せず、各案は**主 Channel の `sense`（ハードウェア × DetectionMethod のペア）でアンカー**して立て、エンジンが残り role と他 Channel を整合させる。案は抽象ラベルでなくアンカー機材で名付ける（「深度カメラ案」「LiDAR案」等。安価/バランス/高精度は副ラベル）。非アンカー Channel は案をまたいで固定し、ある案が変更を強制するときだけ差分を強調する。
_Avoid_: 構成, パッケージ, プラン

**SensedPhenomenon（検出すべき現象）**:
体験を成立させるために検出が必要な物理現象。アプリの背骨。人体系(骨格/手指/存在/人数/視線/発話)・物体系(有無/識別/位置/個数/向き)・力接触系(タッチ/重量荷重/圧力)・空間近接系(距離/ビーム横切り/ゾーン/占有)・運動系(動き/速度/振動/加速度/傾き)・環境系(光量/温度/湿度/音量/気体/色)・位置回転系(エンコーダ/角度)。InteractionSpec は「やりたい体験 → 必要な現象」を持ち、エンジンは現象ごとに**センサー種別を横断して**(人体カメラ/光電/ロードセル/測距/環境)候補を出す。sensedTargets は現象の具体的な解像レベルを表す。**スコープ境界: 体験の入力になりうる現象はすべて対象**（光量・温度・色・回転位置も含む）。設備監視そのもの（体験の入力でない流量・配管圧・電流などの計測）は対象外。
_Avoid_: モダリティ（人体3軸に限定する旧語）, 入力

**SensingChannel（センシングチャネル）**:
Spec の各 **SensedPhenomenon** に対応する1つの検出系統。必要な **role** の集合を持つ。Setup はこの Channel 群の全 role を埋めることで構成される。（旧称の「モダリティ単位」は現象単位に一般化された。gesture/touch/voice は現象の一部にすぎない）
_Avoid_: モダリティ, 系統

**主 Channel（primary channel）**:
構想の中で最も機材選択の幅・コスト影響が大きい SensingChannel（＝最も要求の厳しい SensedPhenomenon。人体とは限らない）。各 Setup はこの主 Channel の `sense` 機材でアンカー（差別化）される。エンジンが自動判定し、判定理由を画面に明示、TD がその場で上書きできる。
_Avoid_: メインセンサー, 基幹

**role（機能役割）**:
SensingChannel が必要とする機能単位。`sense`（検出）/ `interface`（接続）/ `compute`（処理）/ `mount`（設置）。Equipment は role を埋める。**`sense` role はハードウェア（光学/センサー）× DetectionMethod（検出ソフト）のペアで埋まる**（下記）。**role は Channel をまたいで共有されうる**（1台のPCが複数 Channel の compute を兼ねる、1本のトラスが複数の mount を兼ねる）。共有された role は budget で1回だけ計上し、共有の衝突は interference として検出する。

**DetectionMethod（検出手法）**:
光学/センサーのハードウェアとは独立した検出ソフト・ミドルウェア（例: Microsoft Body Tracking SDK, Nuitrack, MediaPipe, ZED SDK, 自前点群人検出）。`sense` role はハードウェア × DetectionMethod のペアで埋まり、実効 envelope（解像できる `resolvableTargets` / `maxTrackedBodies` / レイテンシ）はペアの合成で決まる。同じカメラでも検出手法が違えば別案になりうる（“RealSense+Nuitrack案” vs “RealSense+MediaPipe案”）。compute role に乗る。一部ハードは検出手法が固定（Leap→Ultraleap, ZED→ZED SDK）、汎用 RGB/深度は複数手法と組める。
_Avoid_: SDK（特定実装を指すとき以外）, アルゴリズム

**検出系統（detection lineage）**:
SensingChannel の `sense` role を埋める1つの流儀。Equipment の「2系統」（①リッチトラッキング系=ハードウェア × DetectionMethod のペア ②工業用センサー系=直接出力）に対応し、各系統が「ある SensedPhenomenon に対して sense 候補をどう列挙し、どう成立条件を立てるか」を一手に持つ。系統ごとに固有の Condition と metrics が異なる（リッチ系=precision・追跡定員、工業系=coverage/面積・ゾーン定員）が、latency/budget/feedback/Setup 包装は系統をまたいで共通。エンジンでは `ChannelEvaluator` として実装し、新しいセンサー系統の追加は新 ChannelEvaluator 1つで済む。複数系統が同じ現象を扱えるなら両方が Setup 候補を出す（センサー種別を横断）。
_Avoid_: ストラテジ, ハンドラ, パイプライン

**safety/circulation（安全・動線）**:
Intrinsic な dimension。3つの下位チェックに分解する ── ①個人空間クリアランス（面積/人数 ≥ 最小占有面積、基準は usageModel × modality で変動）②動線・避難（通路・出入口、permanent で強化）③衝突半径（gesture の腕振り等の対人間隔）。基準値は既定値＋TD 上書き可能。**Sensorium の安全判定は設計目安であり、建築基準・消防等の法令判断ではない**（その旨を出力に免責表示する）。
_Avoid_: 安全性検査, 法令チェック

**MountPlan（設置仕様）**:
各 Setup の mount role に対しエンジンが導出する具体的な設置指示（高さ・俯角・台数・配置）。Spec の設置制約（天井高・利用可能マウント、TD が課す上下限）の範囲内で、coverage が最大になる幾何をエンジンが解いて求める。出力（機材案・レポート）に含める。
_Avoid_: 取り付け, リギング

**Condition（成立条件）**:
構想が成立するための名前付き制約。`{ dimension, operator, threshold, currentValue, status, rationale, severity }`。2系統に分かれる（下記）。レポートでは文章化されるが、裏では構造化されたまま保持される。
_Avoid_: 制約, 要件, チェック項目

**IntrinsicCondition（構想由来条件）**:
機材に依存しない、構想・物理そのものが課す Condition。例: 同時人数と面積から導かれる最小クリアランス、混雑由来のオクルージョン、避難動線。Setup を変えても変わらない。Spec 変更でのみ再計算される。

**EquipmentCondition（機材由来条件）**:
選んだ Setup が課す Condition。`derivedFrom: equipmentId` を持つ。例: 「Azure Kinect 1台では面積は最大 6×4m まで」。Setup を変えると再計算される。

**status（ok / warn / fail）**:
Condition の成立度合い。各 dimension が `hardThreshold`（侵犯=fail）と `softMargin`（成立するが余裕がない=warn）を持ち、決定論的に算出される。`fail`=物理的に不成立、`warn`=成立するが余裕帯にあり運用で崩れやすい、`ok`=余裕帯より外で安定。「際どさ」を定量化するための3値であり、2値にはしない。
_Avoid_: 合否, pass/fail

**InterferenceRule（干渉ルール）**:
複数の Equipment を1つの Setup に組んだとき発生する物理干渉のルール（音響・IR光学・RF・熱）。これに当たると interference 次元の EquipmentCondition が生成される。例: マイクが体験音を拾い音声認識を阻害、IR深度センサ同士の構造光干渉。**個別機種でなく `sensingMethod` タグの組で書く**（機種数で爆発しない）。機材DBと同格でユーザー編集可能（追加・無効化可、組み込みルールをシード）。

**sensingMethod（センシング方式タグ）**:
Equipment が持つ物理方式のタグ（例: `ir-structured-light`, `tof`, `passive-rgb`, `acoustic-mic`, `acoustic-emit`）。InterferenceRule はこのタグの組に対して書かれ、新機材はタグを付けるだけで既存ルールが自動適用される。

**Report（レポート）**:
構造化されたエンジン出力（Spec＋選択中 Setup＋全 Condition＋MountPlan＋provenance）から Claude が生成する提出用文章。Claude は**ナレーション専任**に拘束される ── 説明・整理・つなぎの文章化のみ許され、再計算・新しい数値・新しい成立可否の主張は禁止。レポート内の全数値は Condition / Equipment / MountPlan の値にトレースできること。固定6セクション（①構想要約 ②成立条件 ③機材案とトレードオフ ④推奨マウント仕様 ⑤前提と免責 ⑥主要リスクと次に潰す点）に流し込む。markdown / PDF 出力。
_Avoid_: 提案書（口語では可）, ドキュメント

**operating envelope（動作領域）**:
構想が成立する条件の集合＝全 Condition が満たされるパラメータ範囲。このアプリの出力の本質。
_Avoid_: 成立範囲（口語では可だが正式語は operating envelope）

**downstreamAllowance（下流引当）**:
体感レイテンシ（motion-to-photon）のうち、Sensorium のスコープ外（認識処理・アプリロジック・描画・表示）に対する時間引当。エンジンはセンサー＋転送（`Equipment.latencyMs`）だけを責任を持って算出し、下流はこの引当として可視化する。responsiveness ティアごとにデフォルトを持ち、TD が上書き可能。latency 条件は `sensorLatency ≤ 総予算 − downstreamAllowance`。
_Avoid_: バッファ, マージン

**What-if**:
Spec または Setup のパラメータを変更し、エンジンが Condition と Setup ランキングを決定論的に即時再計算する操作。検証ワークスペースの中核機能。

## 条件次元（dimension）

area, capacity, precision, latency, lighting, mounting, noise, occlusion, safety/circulation, interference, budget。各 dimension は Intrinsic か Equipment のいずれかに分類される。**occlusion は両系統に現れる代表例**: ユーザー密度由来（Intrinsic, 機材前から効く）と視点・冗長性由来（Equipment, Setup で動く）を合成指数 `density × vantage ÷ redundancy` で評価する。

## 対話例

> **TD**: 「全身ジェスチャーで10人同時、屋内5×5m」で入れたら occlusion が fail になった。なんで？
> **エンジン担当**: それは Intrinsic 側の occlusion です。10人/25㎡ は密度が高くて、どの Setup を選んでも残る制約。Equipment 側の視点・冗長性では救えても、密度由来は面積を広げるか人数を減らすまで消えません。
> **TD**: じゃあ面積を 8×6m にして What-if。
> **エンジン担当**: 密度が下がって occlusion は warn まで改善しました。ただし主 Channel が全身ジェスチャーなので、面積拡大で深度カメラ案のフットプリントが足りず台数が2→3台に。budget 条件が warn に動いています。
> **TD**: マウントはどうなる？
> **エンジン担当**: MountPlan が更新されて、高さ3.4m・俯角32°・3台を菱形配置、で coverage を最大化しています。この設置仕様はレポートの④に載ります。
> **TD**: 面積は仮定値だったよね、レポートでそこは断っておいて。
> **エンジン担当**: はい、面積は provenance が assumed なので「前提に依存」マーカーが付いていて、レポート⑤の前提と免責に明記されます。
