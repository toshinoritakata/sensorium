import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import {
  EquipmentSchema,
  EquipmentSeedFileSchema,
  SpatialEquipment,
  TouchEquipment,
  AudioEquipment,
  SupportEquipment,
  PresencePointEquipment,
  Distance1dEquipment,
  AreaCurtainEquipment,
  Lidar2dEquipment,
  PressureMatEquipment,
  MotionPirEquipment,
  RadarPresenceEquipment,
  type Equipment,
} from '@sensorium/shared'

/**
 * 取込アダプタ共通部（ADR-0002）。DigiKey(api-distributor) と URL(url-extract) で
 * 写像ロジックは同じなのでここに集約し、二重定義を持たない。各アダプタは取得方法
 * （API 検索 / ページ fetch）と出典スタンプだけを担う。
 *
 * カテゴリ → そのカテゴリのメンバースキーマ。EquipmentSchema(判別ユニオン)は structured output が
 * 受けない（anyOf+$defs 非対応）ため、(1)カテゴリ選択 →(2)単一メンバーで写像、の二段にする。
 * 使うのもユニオンを構成する同一スキーマそのもの＝単一真実。
 */
const CATEGORY_SCHEMAS = {
  spatial: SpatialEquipment,
  touch: TouchEquipment,
  audio: AudioEquipment,
  support: SupportEquipment,
  'presence-point': PresencePointEquipment,
  'distance-1d': Distance1dEquipment,
  'area-curtain': AreaCurtainEquipment,
  'lidar-2d': Lidar2dEquipment,
  'pressure-mat': PressureMatEquipment,
  'motion-pir': MotionPirEquipment,
  'radar-presence': RadarPresenceEquipment,
} as const
type Category = keyof typeof CATEGORY_SCHEMAS
const CATEGORIES = Object.keys(CATEGORY_SCHEMAS) as [Category, ...Category[]]
const CategoryPick = z.object({
  category: z.enum(CATEGORIES).describe('この製品をインタラクティブ展示で使う観点で最も近いカテゴリ'),
})

const SYSTEM = `あなたは Sensorium の機材取込アダプタです。メーカー/ディストリビュータの製品情報1件
（カタログJSON か製品ページのテキスト）を、Sensorium の Equipment envelope へ写像します。
- category は実体に最も近いものを10種から選ぶ: spatial / touch / audio / support / presence-point /
  distance-1d / area-curtain / lidar-2d / pressure-mat / motion-pir / radar-presence。インタラクティブ展示で
  「人/物の検出」に使えないただの部品（抵抗・コネクタ等）は support にする。
  深度/ToF/ステレオカメラは spatial。面を放射状に走査して面内座標を取る 2D スキャニング LiDAR は lidar-2d
  （破断有無だけのライトカーテンは area-curtain）。
- envelope の各数値は提供データから読み取る。読み取れない/自信が無い値は、そのクラスで妥当な代表値を
  入れた上で confidence にフィールド名→"low (推定)" を記す。捏造より「推定」明示を優先。
- rolesProvided は通常 ['sense']。sensingMethod は検出原理（ir-active/ultrasonic/radar/tof/lidar/capacitive/pressure 等）。
- servesModality は既存3軸 touch/gesture/voice に寄せる（近接・存在系は touch、骨格・手は gesture）。
- 価格・id・source は呼び出し側が後で権威的に上書きするので、ここでは仮値でよい（price.value=0 でも可）。
- 出力は必ず指定スキーマに完全準拠した1件の Equipment。欠かさず全必須フィールドを埋める。`

/** 応答テキストから最初の JSON オブジェクトを取り出す（コードフェンスや前後文を許容）。 */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1]! : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

/** 製品1件（カタログJSON or ページテキスト）→ Claude が写像した Equipment（id/source/price は未スタンプ）。 */
export async function mapEquipment(
  client: Anthropic,
  opts: { title: string; raw: string },
): Promise<Equipment | null> {
  const userContent = `製品名: ${opts.title}\nデータ:\n${opts.raw}`

  // (1) カテゴリ選択（軽量・単純 enum なので文法でよい）。
  const pick = await client.messages.parse({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${userContent}\n\nこの製品のカテゴリだけを選んでください。` }],
    output_config: { format: zodOutputFormat(CategoryPick) },
  })
  const category = pick.parsed_output?.category
  if (!category) return null

  // (2) そのカテゴリのメンバースキーマで envelope を写像。
  // spatial 等は構造が複雑で structured output の文法コンパイルがタイムアウトするため、
  // 文法は使わず「JSON Schema を渡して JSON を出させ → zod で検証」。不適合なら誤りを示して1回リトライ。
  const schema = CATEGORY_SCHEMAS[category]
  const jsonSchema = JSON.stringify(z.toJSONSchema(schema))
  const system = `${SYSTEM}\n\nこの製品のカテゴリは「${category}」で確定。次の JSON Schema に完全準拠した\nJSON オブジェクト1個だけを出力（前後に説明やコードフェンスを付けない）:\n${jsonSchema}`
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system,
      messages: [
        {
          role: 'user',
          content:
            attempt === 0
              ? userContent
              : `${userContent}\n\n前回の出力はスキーマ不適合でした: ${lastError}\n修正して JSON のみ再出力してください。`,
        },
      ],
    })
    const text = msg.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
    const json = extractJson(text)
    if (json === null) {
      lastError = 'JSON を抽出できませんでした'
      continue
    }
    const parsed = schema.safeParse(json)
    if (parsed.success) return parsed.data as Equipment
    lastError = parsed.error.issues
      .slice(0, 4)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
  }
  console.warn(`  envelope 写像が検証を通りませんでした: ${lastError}`)
  return null
}

export function slug(...parts: string[]): string {
  return parts.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** ネストした生データから値を緩く拾う（スキーマ揺れに強く）。 */
export function pick(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k]
    } else return undefined
  }
  return cur
}

/**
 * 取込結果を出力ファイルへマージ（id でデデュープ・後勝ち）。単一真実スキーマで最終検証する。
 * out が active seed でも candidates でも同じ。成立判定に入るかは各機材の status が決める。
 */
export function mergeWrite(
  outPath: string,
  mapped: Equipment[],
  meta: Record<string, unknown>,
): number {
  const existing = existsSync(outPath)
    ? EquipmentSeedFileSchema.parse(JSON.parse(readFileSync(outPath, 'utf8'))).equipment
    : []
  const byId = new Map(existing.map((e) => [e.id, e]))
  for (const e of mapped) {
    const parsed = EquipmentSchema.safeParse(e)
    if (!parsed.success) {
      console.warn(`  検証に失敗（スキップ）: ${e.id} — ${parsed.error.issues[0]?.message}`)
      continue
    }
    byId.set(parsed.data.id, parsed.data)
  }
  const file = { _meta: meta, equipment: [...byId.values()] }
  writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n', 'utf8')
  return file.equipment.length
}
