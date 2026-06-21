import { readFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { type Equipment } from '@sensorium/shared'
import { mapEquipment, mergeWrite, pick, slug } from './ingest-lib'

/**
 * 取込アダプタ `api-distributor`（DigiKey 主）の実装（ADR-0002）。
 *   pnpm ingest:digikey "<キーワード>" [--limit N] [--out data/candidates.ingest.json]
 *
 * 流れ: OAuth2(client_credentials) → キーワード検索 → 生カタログを Claude が envelope へ写像（ingest-lib）
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

/** 生製品から出典に使う事実を取り出す（v4 のフィールドパス）。 */
function sourceFacts(product: unknown) {
  const mfr = String(pick(product, 'Manufacturer', 'Name') ?? pick(product, 'Manufacturer') ?? '')
  const partNo = String(pick(product, 'ManufacturerProductNumber') ?? pick(product, 'ManufacturerPartNumber') ?? '')
  const url = String(pick(product, 'ProductUrl') ?? '')
  const unitPrice = Number(pick(product, 'UnitPrice') ?? 0)
  return { mfr, partNo, url, unitPrice }
}

const FETCHED_AT = new Date().toISOString()
const client = new Anthropic()

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
for (const product of products) {
  const facts = sourceFacts(product)
  const eq = await mapEquipment(client, {
    title: `${facts.mfr} ${facts.partNo}`.trim(),
    raw: JSON.stringify(product, null, 2),
  })
  if (!eq) {
    console.warn('  写像できなかった製品を1件スキップしました。')
    continue
  }
  // 出典・価格・id・status は事実が確かなスクリプト側で権威的に上書き（provenance 整合）。
  const stamped: Equipment = {
    ...eq,
    id: slug('dk', facts.mfr || eq.vendor, facts.partNo || eq.name),
    status: 'candidate',
    source: {
      adapter: 'api-distributor',
      distributor: 'DigiKey',
      ...(facts.url ? { sourceUrl: facts.url } : {}),
      fetchedAt: FETCHED_AT,
      verify: true,
    },
    price: { value: facts.unitPrice || eq.price?.value || 0, currency: LOCALE_CURRENCY, asOf: FETCHED_AT.slice(0, 7), verify: true },
  }
  mapped.push(stamped)
  console.log(`  ✓ ${stamped.id} [${stamped.category}] ${stamped.name}`)
}

if (mapped.length === 0) {
  console.error('有効な候補を1件も得られませんでした。')
  process.exit(1)
}

const total = mergeWrite(outPath, mapped, {
  description: 'api-distributor(DigiKey) 取込の候補。status:candidate。人レビューで active seed へ昇格する（ADR-0002）。',
  posture: '出典付き・on-demand・非ミラー。価格/スペックは要検証(verify:true)。',
  lastIngest: { keyword: keyword || `(fixture:${fixture})`, fetchedAt: FETCHED_AT, count: mapped.length },
})
console.log(`\n${mapped.length} 件を候補として ${outPath} に保存（計 ${total} 件）。`)
console.log('次は人レビュー: 値を検証し status を active に上げると成立判定に入ります。')
