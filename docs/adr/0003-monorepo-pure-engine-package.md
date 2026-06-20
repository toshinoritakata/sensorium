# モノレポ構成と、純粋エンジンパッケージの境界

pnpm workspaces のモノレポとし、`packages/engine` を**純粋TS・フレームワーク非依存・Claude/ネットワーク非依存**のパッケージとして切り出す。エンジンは seed（dimensions/equipment/detection-methods/interference）と InteractionSpec を入力に、11次元 Condition と Setup 候補を決定論的に算出する純粋関数群のみを持つ。型とスキーマは `packages/shared`（Zod）を単一の真実とし、seed 検証・取込候補検証にも使う。`apps/web`(React+Vite) は engine を import、`apps/server`（Claude proxy＋取込3アダプタ）は後段。

エンジンを独立パッケージに隔離するのは ADR-0001（計算は決定論エンジン、Claude は入口/出口のみ）をコード構造で強制するため。engine が React や Anthropic SDK や fetch に依存し始めたら ADR-0001 が崩れる兆候であり、依存方向（web→engine、server→engine、engine→何にも依存しない）を構造的に守る。これにより What-if のオフライン即時再計算とエンジン単体テスト（TDD）が保証される。

ビルドは engine 単体の縦切り（UI・Claude なしで1現象を通しテスト）から始め、UI→サーバ(取込/Claude)の順に外側を足す。
