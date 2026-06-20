import { parseArgs } from 'node:util'
import { InteractionSpecSchema, type InteractionSpec } from '@feasisense/shared'
import { evaluate, explain } from '@feasisense/engine'
import { loadAllDetectionMethods, loadAllEquipment } from '@feasisense/engine/load-seeds'

/**
 * コマンドラインから構想を渡して機材案を検証するツール。
 *   pnpm cli -- --phenomenon hands --users 1 --responsiveness tight --lighting controlled --budget 200000
 *   pnpm cli -- --phenomenon step --area 12 --users 4 --budget 800000 --feedback floor-visual
 */
const USAGE = `
FeasiSense 評価 CLI

使い方:
  pnpm cli -- --phenomenon <target> [options]

必須:
  --phenomenon, -p   検出したい現象（step / weight / hands / fingers / limbs / fullBody / presence ...）

任意:
  --area             面積 m²（床/面を覆う現象のみ）
  --users            同時人数
  --responsiveness   tight | normal | relaxed   (既定 normal)
  --lighting         controlled | mixed | bright | dark | outdoor
  --noise            quiet | moderate | loud
  --budget           予算（円）
  --feedback         必要な出力（カンマ区切り: floor-visual,sound ...）
  --discrimination   occupancy | zoned | per-user   (空間弁別の要求度)
  --title            構想名（表示用）
  --frontier         Pareto最適の案だけ表示
  --json             生の Result を JSON で出力
  --help, -h         このヘルプ

例:
  pnpm cli -- -p hands --users 1 --responsiveness tight --lighting dark --budget 300000
  pnpm cli -- -p step --area 20 --users 6 --budget 1500000 --discrimination zoned
`

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined
  const n = Number(v)
  if (Number.isNaN(n)) throw new Error(`数値が不正です: ${v}`)
  return n
}

// pnpm が転送する先頭の `--` を取り除く（あれば）。
const rawArgs = process.argv.slice(2)
const sep = rawArgs.indexOf('--')
const args = sep === -1 ? rawArgs : rawArgs.slice(sep + 1)

const { values } = parseArgs({
  args,
  allowPositionals: false,
  options: {
    phenomenon: { type: 'string', short: 'p' },
    area: { type: 'string' },
    users: { type: 'string' },
    responsiveness: { type: 'string', default: 'normal' },
    lighting: { type: 'string' },
    noise: { type: 'string' },
    budget: { type: 'string' },
    feedback: { type: 'string' },
    discrimination: { type: 'string' },
    title: { type: 'string' },
    frontier: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help || !values.phenomenon) {
  console.log(USAGE)
  process.exit(values.help ? 0 : 1)
}

const draft = {
  id: 'cli',
  title: values.title ?? `${values.phenomenon} の検証`,
  context: {
    area_m2: num(values.area),
    simultaneousUsers: num(values.users),
    responsiveness: values.responsiveness,
    lighting: values.lighting,
    ambientNoise: values.noise,
    budgetJPY: num(values.budget),
  },
  phenomena: [
    {
      id: 'ph',
      sensedTarget: values.phenomenon,
      discrimination: values.discrimination,
    },
  ],
  feedback: values.feedback
    ? values.feedback.split(',').map((k, i) => ({ id: `fb-${i}`, kind: k.trim() }))
    : undefined,
}

let spec: InteractionSpec
try {
  spec = InteractionSpecSchema.parse(draft)
} catch (err) {
  console.error('入力が不正です:')
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}

const equipment = loadAllEquipment()
const detectionMethods = loadAllDetectionMethods()
const result = evaluate(spec, equipment, detectionMethods)

if (values.json) {
  console.log(JSON.stringify(result, null, 2))
} else {
  const shown = values.frontier
    ? { ...result, setups: result.setups.filter((s) => s.paretoOptimal) }
    : result
  console.log(explain(spec, shown))
  if (values.frontier && shown.setups.length === 0 && result.setups.length > 0) {
    console.log(
      `\n（Pareto最適な成立案なし。候補 ${result.setups.length} 件は全て不成立。--frontier を外すと理由付きで表示）`,
    )
  }
}
