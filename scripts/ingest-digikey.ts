import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
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
  PressureMatEquipment,
  MotionPirEquipment,
  RadarPresenceEquipment,
  type Equipment,
} from '@sensorium/shared'

/**
 * カテゴリ → そのカテゴリのメンバースキーマ。EquipmentSchema(判別ユニオン)は structured output が
 * 受けない（anyOf+$defs 非対応）ため、(1)カテゴリ選択 →(2)単一メンバーで写像、の二段にする。
 * 二重定義は持たない: ここで使うのもユニオンを構成する同一スキーマそのもの。
 */
const CATEGORY_SCHEMAS = {
  spatial: SpatialEquipment,
  touch: TouchEquipment,
  audio: AudioEquipment,
  support: SupportEquipment,
  'presence-point': PresencePointEquipment,
  'distance-1d': Distance1dEquipment,
  'area-curtain': AreaCurtainEquipment,
  'pressure-mat': PressureMatEquipment,
  'motion-pir': MotionPirEquipment,
  'radar-presence': RadarPresenceEquipment,
} as const
type Category = keyof typeof CATEGORY_SCHEMAS
const CATEGORIES = Object.keys(CATEGORY_SCHEMAS) as [Category, ...Category[]]
const CategoryPick = z.object({
  category: z.enum(CATEGORIES).describe('この製品をインタラクティブ展示で使う観点で最も近いカテゴリ'),
})

/**
 * 取込アダプタ `api-distributor`（DigiKey 主）の最小実装（ADR-0002）。
 *   pnpm ingest:digikey "<キーワード>" [--limit N] [--out data/candidates.ingest.json]
 *
 * 流れ: OAuth2(client_credentials) → キーワード検索 → 生カタログを Claude が envelope へ写像
 *       → status:'candidate' で候補ファイルへ追記。エンジンは active のみ読むので、ここで取り込んでも
 *       人レビューで昇格するまで成立判定には入らない（候補ゲート）。
 *
 * 法務姿勢（ADR-0002）: 出典付き・on-demand・非ミラー。
 *   - on-demand: 明示キーワード起点・少件数（既定5件、上限はキャップ）。バルク取得しない。
 *   - 出典付き: source.adapter='api-distributor' / distributor='DigiKey' / sourceUrl / fetchedAt を必ず付す。
 *   - 非ミラー: カタログ全体を複製しない。実行前に DigiKey の User Agreement（保存/レート規約）を要確認。
 *
 * 認証なしで写像だけ検証したいとき: --fixture <生製品JSON配列> で DigiKey 呼び出しを差し替える。
 */

// --- 引数 -----------------------------------------------------------------
const argv = process.argv.slice(2)
function flag(name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const fixture = flag('--fixture')
const limitArg = flag('--limit')
const outPath = flag('--out') ?? 'data/candidates.ingest.json'
const LIMIT_CAP = 25 // 非ミラー姿勢: 1回の取込件数に上限を設ける。
const limit = Math.min(limitArg ? Number(limitArg) : 5, LIMIT_CAP)
const keyword = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1]?.startsWith('--') !== true).join(' ').trim()

if (!keyword && !fixture) {
  console.error('使い方: pnpm ingest:digikey "<キーワード>" [--limit N] [--out <path>]')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY が未設定です（.zshrc を source してください）。')
  process.exit(1)
}

// --- DigiKey API ----------------------------------------------------------
const API_BASE = process.env.DIGIKEY_API_BASE ?? 'https://api.digikey.com'
const LOCALE_SITE = process.env.DIGIKEY_LOCALE_SITE ?? 'US'
const LOCALE_LANGUAGE = process.env.DIGIKEY_LOCALE_LANGUAGE ?? 'en'
const LOCALE_CURRENCY = process.env.DIGIKEY_LOCALE_CURRENCY ?? 'USD'

/** OAuth2 client_credentials でアクセストークンを取得。 */
async function getToken(): Promise<string> {
  const id = process.env.DIGIKEY_CLIENT_ID
  const secret = process.env.DIGIKEY_CLIENT_SECRET
  if (!id || !secret) {
    console.error(
      'DIGIKEY_CLIENT_ID / DIGIKEY_CLIENT_SECRET が未設定です。\n' +
        'developer.digikey.com でアプリ登録し、Product Information API のキーを発行のうえ\n' +
        '.env に設定してください（cp .env.example .env して埋める。.env はコミットされません）。\n' +
        '（認証なしで写像だけ試すには --fixture <生製品JSON> を使えます）',
    )
    process.exit(1)
  }
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  })
  if (!res.ok) {
    console.error(`DigiKey トークン取得に失敗 (${res.status}): ${await res.text()}`)
    process.exit(1)
  }
  return ((await res.json()) as { access_token: string }).access_token
}

/** キーワード検索（Product Information API v4）。生の Product 配列を返す。 */
async function searchKeyword(token: string): Promise<unknown[]> {
  const res = await fetch(`${API_BASE}/products/v4/search/keyword`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-DIGIKEY-Client-Id': process.env.DIGIKEY_CLIENT_ID!,
      'X-DIGIKEY-Locale-Site': LOCALE_SITE,
      'X-DIGIKEY-Locale-Language': LOCALE_LANGUAGE,
      'X-DIGIKEY-Locale-Currency': LOCALE_CURRENCY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Keywords: keyword, Limit: limit, Offset: 0 }),
  })
  if (!res.ok) {
    console.error(`DigiKey 検索に失敗 (${res.status}): ${await res.text()}`)
    process.exit(1)
  }
  const json = (await res.json()) as { Products?: unknown[] }
  return (json.Products ?? []).slice(0, limit)
}

// --- 生製品から出典に使う事実を取り出す（スキーマ揺れに強いよう緩く拾う） -------
function pick(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj
  for (const k of keys) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k]
    } else return undefined
  }
  return cur
}
function sourceFacts(product: unknown) {
  const mfr = String(pick(product, 'Manufacturer', 'Name') ?? pick(product, 'Manufacturer') ?? '')
  const partNo = String(pick(product, 'ManufacturerProductNumber') ?? pick(product, 'ManufacturerPartNumber') ?? '')
  const url = String(pick(product, 'ProductUrl') ?? '')
  const unitPrice = Number(pick(product, 'UnitPrice') ?? 0)
  return { mfr, partNo, url, unitPrice }
}
function slug(...parts: string[]): string {
  return parts.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// --- Claude 写像 ----------------------------------------------------------
const SYSTEM = `あなたは Sensorium の機材取込アダプタです。ディストリビュータ(DigiKey)の生の製品データ1件を、
Sensorium の Equipment envelope へ写像します。
- category は実体に最も近いものを10種から選ぶ: spatial / touch / audio / support / presence-point /
  distance-1d / area-curtain / pressure-mat / motion-pir / radar-presence。インタラクティブ展示で
  「人/物の検出」に使えないただの部品（抵抗・コネクタ等）は support にする。
- envelope の各数値は製品 Parameters から読み取る。読み取れない/自信が無い値は、そのクラスで妥当な代表値を
  入れた上で confidence にフィールド名→"low (推定)" を記し、price.verify=true 相当の扱いにする。
- rolesProvided は通常 ['sense']。sensingMethod は検出原理（ir-active/ultrasonic/radar/capacitive/pressure 等）。
- servesModality は既存3軸 touch/gesture/voice に寄せる（近接・存在系は touch）。
- 価格・id・source は呼び出し側が後で権威的に上書きするので、ここでは仮値でよい（price.value=0 でも可）。
- 出力は必ず指定スキーマに完全準拠した1件の Equipment。欠かさず全必須フィールドを埋める。`

const client = new Anthropic()

async function mapToEquipment(product: unknown): Promise<Equipment | null> {
  const facts = sourceFacts(product)
  const userContent = `製品名: ${facts.mfr} ${facts.partNo}\n生データ:\n${JSON.stringify(product, null, 2)}`

  // (1) カテゴリ選択。
  const pick = await client.messages.parse({
    model: 'claude-haiku-4-5', // 分類は軽量タスク。
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: 'user', content: `${userContent}\n\nこの製品のカテゴリだけを選んでください。` }],
    output_config: { format: zodOutputFormat(CategoryPick) },
  })
  const category = pick.parsed_output?.category
  if (!category) return null

  // (2) そのカテゴリのメンバースキーマで envelope を写像。
  const msg = await client.messages.parse({
    model: 'claude-opus-4-8', // envelope 写像は成立判定に効くので精度優先。軽くするなら claude-haiku-4-5。
    max_tokens: 4096,
    system: `${SYSTEM}\n\nこの製品のカテゴリは「${category}」と確定済みです。その envelope を埋めてください。`,
    messages: [{ role: 'user', content: userContent }],
    output_config: { format: zodOutputFormat(CATEGORY_SCHEMAS[category]) },
  })
  if (msg.stop_reason === 'refusal' || !msg.parsed_output) return null

  // 出典・価格・id・status は事実が確かなスクリプト側で権威的に上書き（provenance 整合）。
  const mapped = msg.parsed_output as Equipment
  const id = slug('dk', facts.mfr || mapped.vendor, facts.partNo || mapped.name)
  return {
    ...mapped,
    id,
    status: 'candidate',
    source: {
      adapter: 'api-distributor',
      distributor: 'DigiKey',
      ...(facts.url ? { sourceUrl: facts.url } : {}),
      fetchedAt: FETCHED_AT,
      verify: true,
    },
    price: {
      value: facts.unitPrice || mapped.price?.value || 0,
      currency: LOCALE_CURRENCY,
      asOf: FETCHED_AT.slice(0, 7),
      verify: true,
    },
  }
}

// fetchedAt はワークフロー再現性のため引数化されないが、スクリプト実行時刻を1度だけ確定。
const FETCHED_AT = new Date().toISOString()

// --- 実行 -----------------------------------------------------------------
const products: unknown[] = fixture
  ? (JSON.parse(readFileSync(fixture, 'utf8')) as unknown[])
  : await searchKeyword(await getToken())

if (products.length === 0) {
  console.error('該当製品がありませんでした。')
  process.exit(1)
}
console.log(`${products.length} 件を写像します（Claude）…`)

const mapped: Equipment[] = []
for (const p of products) {
  const eq = await mapToEquipment(p)
  if (!eq) {
    console.warn('  写像できなかった製品を1件スキップしました。')
    continue
  }
  // 単一真実スキーマで最終検証（二重スキーマは持たない）。
  const parsed = EquipmentSchema.safeParse(eq)
  if (!parsed.success) {
    console.warn(`  検証に失敗（スキップ）: ${eq.id} — ${parsed.error.issues[0]?.message}`)
    continue
  }
  mapped.push(parsed.data)
  console.log(`  ✓ ${parsed.data.id} [${parsed.data.category}] ${parsed.data.name}`)
}

if (mapped.length === 0) {
  console.error('有効な候補を1件も得られませんでした。')
  process.exit(1)
}

// 候補ファイルへマージ（id でデデュープ。後勝ち）。active seed には触れない。
const existing = existsSync(outPath)
  ? EquipmentSeedFileSchema.parse(JSON.parse(readFileSync(outPath, 'utf8'))).equipment
  : []
const byId = new Map(existing.map((e) => [e.id, e]))
for (const e of mapped) byId.set(e.id, e)

const file = {
  _meta: {
    description: 'api-distributor(DigiKey) 取込の候補。status:candidate。人レビューで active seed へ昇格する（ADR-0002）。',
    posture: '出典付き・on-demand・非ミラー。価格/スペックは要検証(verify:true)。',
    lastIngest: { keyword: keyword || `(fixture:${fixture})`, fetchedAt: FETCHED_AT, count: mapped.length },
  },
  equipment: [...byId.values()],
}
writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n', 'utf8')
console.log(`\n${mapped.length} 件を候補として ${outPath} に保存（計 ${file.equipment.length} 件）。`)
console.log('次は人レビュー: 値を検証し status を active に上げると成立判定に入ります。')
