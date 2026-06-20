import type {
  Condition,
  Equipment,
  EvaluateResult,
  InteractionSpec,
  PressureMat,
  Setup,
} from '@feasisense/shared'
import { canDetect } from './sensed-targets'
import { FLOOR_PACKING_EFFICIENCY, sensorLatencyAllowance } from './budgets'
import {
  areaCondition,
  budgetCondition,
  capacityCondition,
  latencyCondition,
} from './dimensions/index'

/**
 * 成立ゲート → Setup 組み立ての縦切り（論点B 段1＋段2の最小実装）。
 * 現状は主 Channel = 先頭現象、候補は工業用センサーの直接検出のみ。
 * pressure-mat（step/weight 現象）を実装。spatial/Pareto/MountPlan幾何は後続。
 */
export function evaluate(spec: InteractionSpec, equipment: Equipment[]): EvaluateResult {
  const primary = spec.phenomena[0]
  if (primary === undefined) {
    return { primaryPhenomenonId: '', setups: [], notes: ['phenomena が空です'] }
  }

  // 成立ゲート一次フィルタ: sense role を持ち、active で、現象を直接検出できる機材。
  const candidates = equipment.filter(
    (e) =>
      e.rolesProvided.includes('sense') &&
      e.status !== 'candidate' &&
      canDetect(e, primary.sensedTarget),
  )

  const setups = candidates
    .map((eq) => buildSetup(spec, primary.id, eq))
    .filter((s): s is Setup => s !== null)

  const notes: string[] = []
  if (setups.length === 0) {
    notes.push(
      `現象「${primary.sensedTarget}」を直接検出できる active な機材が機材DBに無いか、未対応カテゴリです。`,
    )
  }

  return { primaryPhenomenonId: primary.id, setups, notes }
}

function buildSetup(
  spec: InteractionSpec,
  phenomenonId: string,
  eq: Equipment,
): Setup | null {
  if (eq.category === 'pressure-mat') {
    return buildPressureMatSetup(spec, phenomenonId, eq)
  }
  // 他カテゴリは後続スライス。
  return null
}

function buildPressureMatSetup(
  spec: InteractionSpec,
  phenomenonId: string,
  mat: PressureMat,
): Setup {
  const perMatArea = mat.area_m2 ?? (mat.dims_m ? mat.dims_m[0] * mat.dims_m[1] : 1.0)
  const coverablePerMat = perMatArea * FLOOR_PACKING_EFFICIENCY

  // タイル化: 必要面積を覆う最小枚数（論点D「1台で無理ならタイル」の床版）。
  const count = Math.max(1, Math.ceil(spec.context.area_m2 / coverablePerMat))
  const coverable = count * coverablePerMat
  const totalCostJPY = mat.price.value * count

  const { comfortAllowanceMs, tolerableAllowanceMs } = sensorLatencyAllowance(spec)

  // 感圧マットは1枚=1ゾーン。multi ゾーン品は将来 zones 数を envelope から取る。
  const zones = count

  const conditions: Condition[] = [
    areaCondition(spec.context.area_m2, coverable),
    capacityCondition(spec.context.simultaneousUsers, zones),
    latencyCondition(mat.responseTimeMs, comfortAllowanceMs, tolerableAllowanceMs),
    budgetCondition(totalCostJPY, spec.context.budgetJPY),
  ]

  return {
    id: `setup-${mat.id}`,
    label: `${mat.name} ×${count}`,
    anchorEquipmentId: mat.id,
    channels: [{ phenomenonId, equipmentIds: [mat.id], count }],
    conditions,
    totalCostJPY,
    paretoLabels: ['最堅牢', 'オクルージョン無縁'],
    mountPlan: {
      equipmentId: mat.id,
      count,
      layout: `${count} 枚を床にタイル敷設（充填効率 ${FLOOR_PACKING_EFFICIENCY}）`,
    },
  }
}
