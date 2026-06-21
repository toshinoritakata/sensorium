import Anthropic from '@anthropic-ai/sdk'
import { type Equipment } from '@sensorium/shared'
import { mapEquipment, mergeWrite, slug } from './ingest-lib'

/**
 * 取込アダプタ `url-extract`（ADR-0002）。任意の製品ページURLを fetch し、本文テキストを Claude が
 * Equipment envelope へ写像する。公開APIの無いメーカー直販（Orbbec/Hokuyo 等）を1点ずつ on-demand 取込。
 *   pnpm ingest:url <URL> [<URL> ...] [--status candidate|active] [--out <path>]
 *
 * 既定は status:'candidate'（候補ゲート）。信頼する定番だけは明示的に --status active で即有効化できる。
 * 法務姿勢（ADR-0002）: 出典付き・on-demand・非ミラー。source.adapter='url-extract' / sourceUrl / fetchedAt
 * を必ず付し、価格・スペックは verify:true（ページは要検証の置き値）。
 */

const argv = process.argv.slice(2)
function flag(name: string): string | undefined {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : undefined
}
const status = (flag('--status') ?? 'candidate') as 'candidate' | 'active'
if (status !== 'candidate' && status !== 'active') {
  console.error('--status は candidate か active。')
  process.exit(1)
}
const outPath = flag('--out') ?? (status === 'active' ? 'data/reference.seed.json' : 'data/candidates.ingest.json')
const FLAG_VALUES = new Set(['--status', '--out'])
const urls = argv.filter((a, i) => a.startsWith('http') && !FLAG_VALUES.has(argv[i - 1] ?? ''))

if (urls.length === 0) {
  console.error('使い方: pnpm ingest:url <URL> [<URL> ...] [--status candidate|active] [--out <path>]')
  process.exit(1)
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY が未設定です（.zshrc を source してください）。')
  process.exit(1)
}

/** ページHTMLを fetch し、写像に渡せるテキストへ縮約（script/style 除去・タグ落とし・空白圧縮・上限）。 */
async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Sensorium ingest; url-extract)', Accept: 'text/html' },
    redirect: 'follow',
  })
  if (!res.ok) {
    console.warn(`  fetch 失敗 (${res.status}): ${url}`)
    return null
  }
  const html = await res.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  // JSON-LD など埋め込み構造データがあれば拾って先頭に足す（仕様が入っていることが多い）。
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1]?.trim())
    .filter(Boolean)
    .join('\n')
  return `${ld ? `[構造データ]\n${ld}\n\n` : ''}[本文]\n${text}`.slice(0, 16000)
}

const FETCHED_AT = new Date().toISOString()
const client = new Anthropic()

const mapped: Equipment[] = []
for (const url of urls) {
  console.log(`取得中: ${url}`)
  const raw = await fetchText(url)
  if (!raw) continue
  const eq = await mapEquipment(client, { title: url, raw })
  if (!eq) {
    console.warn('  写像できませんでした（スキップ）。')
    continue
  }
  // 出典・id・status はスクリプト側で権威的に上書き。価格はページ由来が不確実なので verify:true 据え置き。
  const stamped: Equipment = {
    ...eq,
    id: slug('url', eq.vendor, eq.name),
    status,
    source: { adapter: 'url-extract', sourceUrl: url, fetchedAt: FETCHED_AT, verify: true },
    price: { ...eq.price, verify: true },
  }
  mapped.push(stamped)
  console.log(`  ✓ ${stamped.id} [${stamped.category}] ${stamped.name}`)
}

if (mapped.length === 0) {
  console.error('有効な機材を1件も得られませんでした。')
  process.exit(1)
}

const total = mergeWrite(outPath, mapped, {
  description:
    status === 'active'
      ? 'url-extract 取込の定番機材（手キュレーションで status:active）。出典URL付き。価格/スペックは要検証(verify:true)。'
      : 'url-extract 取込の候補。status:candidate。人レビューで昇格する（ADR-0002）。',
  posture: '出典付き・on-demand・非ミラー。',
  lastIngest: { urls, fetchedAt: FETCHED_AT, count: mapped.length },
})
console.log(`\n${mapped.length} 件を status:${status} で ${outPath} に保存（計 ${total} 件）。`)
if (status === 'candidate') console.log('次は人レビュー: 値を検証し status を active に上げると成立判定に入ります。')
