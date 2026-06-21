import Anthropic from '@anthropic-ai/sdk'
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
 * モデル出力の検証スキーマ。形だけ持つ（モデルが読む説明文は下の JSON_SCHEMA 側に一本化）。
 * structured output で形は保証されるが、念のためここで parse して型と妥当性を確定する。
 */
const ExtractionSchema = z.object({
  title: z.string(),
  area_m2: z.number().nullable(),
  simultaneousUsers: z.number().nullable(),
  responsiveness: z.enum(['tight', 'normal', 'relaxed']),
  lighting: z.enum(['controlled', 'mixed', 'bright', 'dark', 'outdoor']).nullable(),
  budgetJPY: z.number().nullable(),
  phenomena: z
    .array(
      z.object({
        sensedTarget: z.string(),
        label: z.string(),
        discrimination: z.enum(['occupancy', 'zoned', 'per-user']).nullable(),
      }),
    )
    .min(1),
  feedback: z.array(z.object({ kind: z.enum(['floor-visual', 'surface-visual', 'sound', 'light']), label: z.string() })),
  provenanceNotes: z.array(z.object({ field: z.string(), provenance: z.enum(['stated', 'inferred', 'assumed']) })),
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

/** Claude の構造化出力に渡す JSON Schema（手書き。zod のバージョン結合を避ける）。 */
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string', description: '体験の短い名前' },
    area_m2: { type: ['number', 'null'], description: '床/面の面積[m²]。円形は半径から面積に直す。無ければ null' },
    simultaneousUsers: { type: ['integer', 'null'], description: '同時人数。無ければ null' },
    responsiveness: { type: 'string', enum: ['tight', 'normal', 'relaxed'] },
    lighting: { anyOf: [{ type: 'string', enum: ['controlled', 'mixed', 'bright', 'dark', 'outdoor'] }, { type: 'null' }] },
    budgetJPY: { type: ['number', 'null'], description: '予算[円]。無ければ null' },
    phenomena: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sensedTarget: {
            type: 'string',
            description: '検出すべき現象: step/weight/hands/fingers/limbs/fullBody/presence/motion/objectPresence/zoneCrossing/distance1d/count/voiceCommand 等',
          },
          label: { type: 'string' },
          discrimination: { anyOf: [{ type: 'string', enum: ['occupancy', 'zoned', 'per-user'] }, { type: 'null' }] },
        },
        required: ['sensedTarget', 'label', 'discrimination'],
      },
    },
    feedback: {
      type: 'array',
      description: '必要な出力。床が光る=floor-visual 等。無ければ空配列',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['floor-visual', 'surface-visual', 'sound', 'light'] },
          label: { type: 'string' },
        },
        required: ['kind', 'label'],
      },
    },
    provenanceNotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          provenance: { type: 'string', enum: ['stated', 'inferred', 'assumed'] },
        },
        required: ['field', 'provenance'],
      },
    },
  },
  required: ['title', 'area_m2', 'simultaneousUsers', 'responsiveness', 'lighting', 'budgetJPY', 'phenomena', 'feedback', 'provenanceNotes'],
} as const

const client = new Anthropic()

const message = await client.messages.create({
  // 入口の構造抽出は軽量なので Haiku で十分（コスト優先）。精度が要れば claude-opus-4-8 へ。
  model: 'claude-haiku-4-5',
  max_tokens: 4096,
  system: SYSTEM,
  messages: [{ role: 'user', content: text }],
  output_config: { format: { type: 'json_schema', schema: JSON_SCHEMA } },
})

if (message.stop_reason === 'refusal') {
  console.error('Claude が拒否しました。'); process.exit(1)
}
const jsonText = message.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text
if (!jsonText) {
  console.error('抽出に失敗しました。stop_reason:', message.stop_reason)
  process.exit(1)
}
const parsed = ExtractionSchema.safeParse(JSON.parse(jsonText))
if (!parsed.success) {
  console.error('抽出結果が想定スキーマに合いませんでした:', parsed.error.message)
  process.exit(1)
}
const ex = parsed.data

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
