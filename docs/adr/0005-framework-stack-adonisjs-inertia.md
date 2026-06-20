# フレームワークスタック: AdonisJS ＋ Inertia(React)、サーバ権威のフルスタック

フルスタックの器を **AdonisJS** とし、フロントは **Inertia.js ＋ React** で Adonis が配信する。コアエンジンはサーバ権威（ADR-0004）なので、サーバが強いフレームワークを選ぶ。

## 構成
- モノレポ（pnpm workspaces）。`packages/engine`（純粋TS）・`packages/shared`（Zod 型/スキーマ）は不変（ADR-0003）。
- `apps/server` = AdonisJS: engine を import してコア計算、**Lucid ORM ＋ マイグレーション**で機材/候補DB（SQLite で開始→Postgres）、サービス＋IoC で取込3アダプタ（ADR-0002）、**Ace コマンド＋スケジューラ**で定期同期、コントローラで Claude proxy と評価API。
- フロント = Inertia + React（Adonis が配信、ビルドは Vite）。サーバ権威なので API 境界を増やさず一体で作る。
- バリデーションは **Zod に一本化**（Adonis 標準の VineJS は使わない）。engine が純粋に Zod を要し、二重の検証系を持たないため。

## 検討した代替
- **Next.js**: React 一体感・エコシステムは上だが、ORM/スケジューラ/コマンド等バックエンドの作法が薄く、取込＋定期同期要件に対し自前構築が増える。
- **Vite SPA ＋ 別バックエンド(Hono)**: 軽量だが、サーバ権威・DB・取込・Claude を一体で持つ今の重心にはフルスタックの器が素直。
- **Adonis ＋ 別Vite SPA**: フロント分離は将来の再利用に有利だが、今は API 境界の保守が増えるだけ。将来必要なら Inertia から API へ切り出せる。

AdonisJS は Next.js より採用例が少なくロックインがあるが、取込・定期更新・DB・サーバ権威エンジンという本アプリの重心に最も整合するため採用する。
