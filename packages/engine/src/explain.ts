import type { EvaluateResult, InteractionSpec, Setup } from '@feasisense/shared'
import { isFeasible } from '@feasisense/shared'

const MARK: Record<string, string> = { ok: '✓', warn: '△', fail: '✗' }

/** evaluate の入力と出力を人が読める1枚に整形する（精度確認・チューニング用の開発ツール）。 */
export function explain(spec: InteractionSpec, result: EvaluateResult): string {
  const c = spec.context
  const lines: string[] = []

  const parts = [
    c.area_m2 !== undefined ? `面積 ${c.area_m2}m²` : '面積 指定なし',
    c.simultaneousUsers !== undefined ? `同時 ${c.simultaneousUsers}人` : '人数 指定なし',
    `応答 ${c.responsiveness}`,
    c.budgetJPY ? `予算 ${c.budgetJPY.toLocaleString()}円` : '予算 未指定',
  ]
  lines.push(`■ 構想: ${spec.title}`)
  lines.push(`  ${parts.join(' / ')}`)
  lines.push(
    `  必要現象: ${spec.phenomena.map((p) => `${p.sensedTarget}${p.label ? `（${p.label}）` : ''}`).join(', ')}`,
  )
  lines.push('')

  if (result.setups.length === 0) {
    lines.push('機材案: 0 件')
    for (const n of result.notes ?? []) lines.push(`  ! ${n}`)
    return lines.join('\n')
  }

  lines.push(`機材案 ${result.setups.length} 件:`)
  result.setups.forEach((s, i) => {
    lines.push('')
    lines.push(explainSetup(s, i + 1))
  })
  return lines.join('\n')
}

function explainSetup(s: Setup, n: number): string {
  const lines: string[] = []
  lines.push(`【案${n}】${s.label}   ${s.totalCostJPY.toLocaleString()}円`)
  if (s.paretoLabels.length) lines.push(`  ラベル: ${s.paretoLabels.join(', ')}`)
  if (s.mountPlan) lines.push(`  設置: ${s.mountPlan.layout ?? `${s.mountPlan.count}台`}`)
  for (const cond of s.conditions) {
    const mark = MARK[cond.status] ?? '?'
    lines.push(`  ${mark} ${cond.status.padEnd(4)} ${cond.dimension.padEnd(9)} ${cond.rationale}`)
  }
  lines.push(`  → ${isFeasible(s) ? '成立（fail なし）' : '不成立（fail あり）'}`)
  return lines.join('\n')
}
