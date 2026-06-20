import type {
  Condition,
  ConditionStatus,
  Discrimination,
  FeedbackKind,
  Lighting,
} from '@feasisense/shared'
import { LIGHTING_LUX } from '../budgets'

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

/**
 * area 次元（カメラ等の固定FOV系）: required / maxCoverable。ok<0.85 / warn 0.85–1.0 / fail>1.0。
 * 床射影は遠近で端が欠けるため 15% の余裕代を取る。
 */
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

/**
 * area 次元（タイル敷設系: 感圧マット/LEDフロア/ライトカーテン）。
 * 敷いた所がそのまま検出域で、端ロスは充填効率に織り込み済み。枚数で必ず充足できるため
 * 面積はリスクでなくコスト要因（律速は予算）。常に ok とし、枚数とカバー面積を残す。
 */
export function tiledFloorAreaCondition(
  requiredM2: number,
  coverableM2: number,
  count: number,
): Condition {
  return {
    dimension: 'area',
    status: 'ok',
    currentValue: round(coverableM2, 2),
    threshold: requiredM2,
    operator: 'coverable ≥ required',
    rationale: `${count} 枚で必要 ${requiredM2}m² をカバー（実効 ${round(coverableM2, 2)}m²）。タイル系は枚数で必ず充足でき、律速は予算側に移る。`,
    derivedFrom: 'spec.context.area_m2, タイル枚数×実効面積',
    severity: 'info',
  }
}

/**
 * capacity 次元: 空間弁別の要求度で意味が変わる。
 * occupancy=人数非依存（トリガーのみ）/ zoned・per-user=独立ゾーンが人数分要る。
 * ok<0.8 / warn 0.8–1.0 / fail>1.0。
 */
export function capacityCondition(
  users: number,
  zones: number,
  discrimination: Discrimination,
): Condition {
  if (discrimination === 'occupancy') {
    return {
      dimension: 'capacity',
      status: 'ok',
      currentValue: users,
      rationale: `踏み有無のトリガー検出（occupancy）は同時人数に依存しない。${users} 人でも『誰かが踏んだ』を返せる。`,
      derivedFrom: 'phenomenon.discrimination=occupancy',
      severity: 'info',
    }
  }
  const util = users / zones
  const label = discrimination === 'per-user' ? '個人弁別' : 'ゾーン弁別'
  const note =
    zones <= 1
      ? `単一ゾーン出力では位置を弁別できない（独立ゾーン ${zones}）。アドレス可能な機材が要る。`
      : `独立ゾーン ${zones} に対し同時 ${users} 人。出入りで瞬間的に超過しやすく 80% 超で警告。`
  return {
    dimension: 'capacity',
    status: utilizationStatus(util, 0.8),
    currentValue: round(util),
    threshold: 0.8,
    operator: 'utilization <',
    rationale: `${label}（${discrimination}）に充足率 ${round(util)}。${note}`,
    derivedFrom: 'spec.context.simultaneousUsers, 独立ゾーン数, phenomenon.discrimination',
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

/**
 * precision 次元（spatial ペア）: 必要解像が実効 resolvableTargets に含まれるか。
 * 候補化でゲート済みなら ok。含まなければ fail。
 */
export function precisionCondition(required: string, resolvable: readonly string[]): Condition {
  const has = resolvable.includes(required)
  return {
    dimension: 'precision',
    status: has ? 'ok' : 'fail',
    rationale: has
      ? `必要解像 ${required} を実効解像 [${resolvable.join(', ')}] が含む。`
      : `必要解像 ${required} を出せない（実効 [${resolvable.join(', ')}]）。`,
    derivedFrom: 'phenomenon.sensedTarget, ペア resolvableTargets',
    severity: 'hard',
  }
}

/**
 * capacity 次元（spatial 追跡系）: 同時人数 vs ペアの maxTrackedBodies。
 * ok<0.8 / warn 0.8–1.0 / fail>1.0。
 */
export function trackingCapacityCondition(users: number, maxBodies: number): Condition {
  const util = users / maxBodies
  return {
    dimension: 'capacity',
    status: utilizationStatus(util, 0.8),
    currentValue: round(util),
    threshold: 0.8,
    operator: 'utilization <',
    rationale: `同時 ${users} 人 / 追跡上限 ${maxBodies} = 充足率 ${round(util)}。GPU/実装依存で上限は揺れ、満員運用は取りこぼす。`,
    derivedFrom: 'spec.context.simultaneousUsers, ペア maxTrackedBodies',
    severity: 'soft',
  }
}

/**
 * lighting 次元: 想定照度帯と機材レンジ/屋外可否の突合。要求なしなら null。
 * outdoor かつ sunlightOk=false は fail、帯が機材外なら fail、端／mixed は warn。
 */
export function lightingCondition(
  lighting: Lighting | undefined,
  hw: { minLux: number; maxLux: number; sunlightOk: boolean },
): Condition | null {
  if (lighting === undefined) return null
  const [lo, hi] = LIGHTING_LUX[lighting]

  let status: ConditionStatus
  let why: string
  if (lighting === 'outdoor' && !hw.sunlightOk) {
    status = 'fail'
    why = '屋外光に未対応（sunlightOk=false）。'
  } else if (hi < hw.minLux || lo > hw.maxLux) {
    status = 'fail'
    why = `想定照度 ${lo}–${hi}lux が機材レンジ ${hw.minLux}–${hw.maxLux}lux の外。`
  } else if (lo < hw.minLux || hi > hw.maxLux || lighting === 'mixed') {
    status = 'warn'
    why = `想定照度 ${lo}–${hi}lux が機材レンジの端にかかる（${lighting}）。外光対策や機種選定の余地。`
  } else {
    status = 'ok'
    why = `想定照度 ${lo}–${hi}lux が機材レンジ ${hw.minLux}–${hw.maxLux}lux に収まる。`
  }
  return {
    dimension: 'lighting',
    status,
    rationale: why,
    derivedFrom: 'spec.context.lighting, 機材 minLux/maxLux/sunlightOk',
    severity: 'soft',
  }
}

/**
 * feedback 次元: 必要な出力を Setup の機材が一体で満たすか。
 * 要求なしなら null（条件を出さない）。満たさない出力があれば fail
 * （床演出は別系統=投影等が要り、この案単体では成立しない）。
 */
export function feedbackCondition(
  required: readonly FeedbackKind[],
  provided: ReadonlySet<FeedbackKind>,
): Condition | null {
  if (required.length === 0) return null
  const missing = required.filter((k) => !provided.has(k))
  const status: ConditionStatus = missing.length > 0 ? 'fail' : 'ok'
  const rationale =
    missing.length > 0
      ? `必要な出力 [${required.join(', ')}] のうち [${missing.join(', ')}] をこの案の機材が出せない。床演出には別系統（投影等）が要る。`
      : `必要な出力 [${required.join(', ')}] を機材が一体で提供。`
  return {
    dimension: 'feedback',
    status,
    rationale,
    derivedFrom: 'spec.feedback, 機材.providesFeedback',
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
