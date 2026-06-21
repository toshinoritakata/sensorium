import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { InteractionSpecSchema, type InteractionSpec } from '@feasisense/shared'
import { evaluate, explain } from '@feasisense/engine'
import { loadAllDetectionMethods, loadAllEquipment } from '@feasisense/engine/load-seeds'

/**
 * 入口（ingest）の最小実装（論点C）。自由文 → Claude が InteractionSpec を構造化抽出 → エンジン評価。
 *   pnpm ask "踏むと光る床、直径10mの円形、20人くらい乗る"
 * Claude は「何を検出する体験か」までを抽出し、機材選定はしない（エンジン専任）。
 * 欠落は provenance=assumed でブロックしない。数値はそのまま渡し、計算はエンジンが持つ。
 */

const text = process.argv.slice(2).join(' ').trim()
if (!text) {
  console.error('使い方: pnpm ask "<やりたい体験を自由文で>"')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY が未設定です（.zshrc を source してください）。')
  process.exit(1)
}

/**
 * 抽出スキーマ（単一の真実）。これ1つから structured output の JSON Schema を生成し（zodOutputFormat）、
 * 返ってきた JSON の検証にも同じものを使う。describe はそのままモデルへの項目説明になる。
 */
const ExtractionSchema = z.object({
  title: z.string().describe('体験の短い名前'),
  area_m2: z.number().nullable().describe('床/面の面積[m²]。円形は半径から面積に直す(π×r²)。無ければ null'),
  simultaneousUsers: z.number().int().nullable().describe('同時に体験する人数。無ければ null'),
  responsiveness: z.enum(['tight', 'normal', 'relaxed']).describe('即応性。即時=tight, 普通=normal, 余裕可=relaxed'),
  lighting: z.enum(['controlled', 'mixed', 'bright', 'dark', 'outdoor']).nullable().describe('照明環境。無ければ null'),
  budgetJPY: z.number().nullable().describe('予算[円]。無ければ null'),
  phenomena: z
    .array(
      z.object({
        sensedTarget: z
          .string()
          .describe('検出すべき現象: step/weight/hands/fingers/limbs/fullBody/presence/motion/objectPresence/zoneCrossing/distance1d/count/voiceCommand 等'),
        label: z.string(),
        discrimination: z
          .enum(['occupancy', 'zoned', 'per-user'])
          .nullable()
          .describe('空間弁別。踏み有無のみ=occupancy, 位置を区別=zoned, 個人追跡=per-user'),
      }),
    )
    .min(1),
  feedback: z
    .array(z.object({ kind: z.enum(['floor-visual', 'surface-visual', 'sound', 'light']), label: z.string() }))
    .describe('必要な出力。床が光る=floor-visual 等。無ければ空配列'),
  provenanceNotes: z
    .array(z.object({ field: z.string(), provenance: z.enum(['stated', 'inferred', 'assumed']) }))
    .describe('主要フィールドの出所（明記/推論/仮置き）'),
})

const SYSTEM = `あなたは FeasiSense の入口です。テクニカルディレクタの自由文から、体験の構造（InteractionSpec）を抽出します。
- 抽出するのは「何を検出したい体験か」まで。**機材・センサー・製品の選定はしない**（それはエンジンの仕事）。
- 文中に機材名があっても、それは制約ヒントとして読むだけで、出力には含めない。
- 円形や畳など面積が間接的なら m² に換算する（円は π×半径²）。
- 情報が無い項目は null や空配列にし、無理に埋めない。止めない。
- discrimination の推論: 出力が位置に応じて変わる体験（踏んだ箇所が光る等の floor/surface-visual を伴う）で、かつ
  複数人が同時に乗る・広い面積がある場合は、踏み位置を区別する必要があるため **zoned** を既定にする
  （単に在/不在だけ分かればよい体験は occupancy、個人を追跡するなら per-user）。この場合 provenance は inferred。
- provenanceNotes に主要フィールドが明記(stated)/推論(inferred)/仮置き(assumed)のどれかを記す。`

const client = new Anthropic()

const message = await client.messages.parse({
  // 入口の構造抽出は軽量なので Haiku で十分（コスト優先）。精度が要れば claude-opus-4-8 へ。
  model: 'claude-haiku-4-5',
  max_tokens: 4096,
  system: SYSTEM,
  messages: [{ role: 'user', content: text }],
  output_config: { format: zodOutputFormat(ExtractionSchema) },
})

if (message.stop_reason === 'refusal') {
  console.error('Claude が拒否しました。'); process.exit(1)
}
const ex = message.parsed_output
if (!ex) {
  console.error('抽出に失敗しました。stop_reason:', message.stop_reason)
  process.exit(1)
}

// 抽出結果 → InteractionSpec（null/空は省く）。
const draft = {
  id: 'ask',
  title: ex.title,
  context: {
    ...(ex.area_m2 != null ? { area_m2: ex.area_m2 } : {}),
    ...(ex.simultaneousUsers != null ? { simultaneousUsers: ex.simultaneousUsers } : {}),
    responsiveness: ex.responsiveness,
    ...(ex.lighting != null ? { lighting: ex.lighting } : {}),
    ...(ex.budgetJPY != null ? { budgetJPY: ex.budgetJPY } : {}),
  },
  phenomena: ex.phenomena.map((p, i) => ({
    id: `ph-${i}`,
    sensedTarget: p.sensedTarget,
    label: p.label,
    ...(p.discrimination ? { discrimination: p.discrimination } : {}),
  })),
  ...(ex.feedback.length ? { feedback: ex.feedback.map((f, i) => ({ id: `fb-${i}`, kind: f.kind, label: f.label })) } : {}),
}

let spec: InteractionSpec
try {
  spec = InteractionSpecSchema.parse(draft)
} catch (err) {
  console.error('抽出結果が InteractionSpec に適合しませんでした:')
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

console.log('── 抽出された構想（フォーム） ─────────────')
console.log(JSON.stringify(spec, null, 2))
const prov = ex.provenanceNotes.map((n) => `${n.field}=${n.provenance}`).join(' / ')
if (prov) console.log('provenance:', prov)
console.log('')

const equipment = loadAllEquipment()
const detectionMethods = loadAllDetectionMethods()
console.log(explain(spec, evaluate(spec, equipment, detectionMethods)))
