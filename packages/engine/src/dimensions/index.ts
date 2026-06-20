import type { Condition, ConditionStatus } from '@feasisense/shared'

/**
 * 連続値の utilization → status。閾値は data/dimensions.seed.json 準拠。
 * ok < okMax ≤ warn ≤ 1.0 < fail。
 */
export function utilizationStatus(util: number, okMax: number): ConditionStatus {
  if (util > 1.0) return 'fail'
  if (util >= okMax) return 'warn'
  return 'ok'
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** area 次元: required / maxCoverable。ok<0.85 / warn 0.85–1.0 / fail>1.0。 */
export function areaCondition(requiredM2: number, coverableM2: number): Condition {
  const util = requiredM2 / coverableM2
  return {
    dimension: 'area',
    status: utilizationStatus(util, 0.85),
    currentValue: round(util),
    threshold: 0.85,
    operator: 'utilization <',
    rationale: `必要 ${requiredM2}m² / カバー可能 ${round(coverableM2, 2)}m² = 充足率 ${round(util)}。端の欠落・キャリブずれで実効カバーが縮むため 85% 超で警告。`,
    derivedFrom: 'spec.context.area_m2, Σ(機材カバー面積)',
    severity: 'soft',
  }
}

/** capacity 次元: users / 検出ゾーン数。ok<0.8 / warn 0.8–1.0 / fail>1.0。 */
export function capacityCondition(users: number, zones: number): Condition {
  const util = users / zones
  return {
    dimension: 'capacity',
    status: utilizationStatus(util, 0.8),
    currentValue: round(util),
    threshold: 0.8,
    operator: 'utilization <',
    rationale: `同時 ${users} 人 / 検出ゾーン ${zones} = 充足率 ${round(util)}。出入りで瞬間的に超過しやすく 80% 超で警告。`,
    derivedFrom: 'spec.context.simultaneousUsers, 機材ゾーン数',
    severity: 'soft',
  }
}

/** latency 次元: responseTime を予算と突合。ok ≤ comfort−allowance / warn ≤ tolerable−allowance / fail それ超。 */
export function latencyCondition(
  responseTimeMs: number,
  comfortAllowanceMs: number,
  tolerableAllowanceMs: number,
): Condition {
  const status: ConditionStatus =
    responseTimeMs <= comfortAllowanceMs
      ? 'ok'
      : responseTimeMs <= tolerableAllowanceMs
        ? 'warn'
        : 'fail'
  return {
    dimension: 'latency',
    status,
    currentValue: responseTimeMs,
    threshold: comfortAllowanceMs,
    operator: 'responseTimeMs ≤',
    rationale: `応答 ${responseTimeMs}ms vs sensor+detect 予算 ${comfortAllowanceMs}ms（快適）/ ${tolerableAllowanceMs}ms（許容）。工業用センサーは推論加算なしで低遅延が強み。`,
    derivedFrom: '機材 responseTimeMs, responsivenessBudget',
    severity: 'hard',
  }
}

/** budget 次元: 総額 vs 予算。ok<0.9 / warn 0.9–1.1 / fail>1.1。未指定なら情報のみ。 */
export function budgetCondition(totalJPY: number, budgetJPY?: number): Condition {
  if (budgetJPY === undefined) {
    return {
      dimension: 'budget',
      status: 'ok',
      currentValue: totalJPY,
      rationale: `総額 ${totalJPY.toLocaleString()} 円（予算未指定のため情報表示のみ）。価格は全て要検証の置き値。`,
      derivedFrom: 'Σ(機材price)',
      severity: 'info',
    }
  }
  const ratio = totalJPY / budgetJPY
  const status: ConditionStatus = ratio > 1.1 ? 'fail' : ratio >= 0.9 ? 'warn' : 'ok'
  return {
    dimension: 'budget',
    status,
    currentValue: totalJPY,
    threshold: budgetJPY,
    operator: 'total ≤ 1.1×budget',
    rationale: `総額 ${totalJPY.toLocaleString()} 円 / 予算 ${budgetJPY.toLocaleString()} 円 = ${round(ratio, 2)}。見積りは±10%振れるため帯で評価。価格は要検証の置き値。`,
    derivedFrom: 'Σ(機材price), spec.context.budgetJPY',
    severity: 'soft',
  }
}
