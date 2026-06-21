import type {
  Condition,
  DetectionMethod,
  Equipment,
  EvaluateResult,
  FeedbackKind,
  InteractionSpec,
  Phenomenon,
  PressureMat,
  Setup,
} from '@sensorium/shared'
import { canDetect, isSkeletalTarget } from './sensed-targets'
import {
  consumedModality,
  isCompatible,
  isSpatial,
  pairCostJPY,
  pairLatencyMs,
  pairMaxBodies,
  resolvableTargets,
  type SpatialEquipment,
} from './pairing'
import { FLOOR_PACKING_EFFICIENCY, sensorLatencyAllowance } from './budgets'
import { annotatePareto, detectionRobustness, precisionRank } from './pareto'
import {
  budgetCondition,
  capacityCondition,
  feedbackCondition,
  latencyCondition,
  lightingCondition,
  precisionCondition,
  tiledFloorAreaCondition,
  trackingCapacityCondition,
} from './dimensions/index'

/**
 * 成立ゲート → Setup 組み立ての縦切り（論点B 段1＋段2）。
 * 主 Channel は先頭の現象。候補は二経路で集める:
 *   経路1 = 工業用センサーの直接検出（感圧マット等）、
 *   経路2 = spatial ハード × DetectionMethod のペア合成（骨格/身体系）。
 * 集めた候補は Pareto で被支配を注記する。
 * 後続: spatial の MountPlan 幾何（カメラ被覆 / FOV）、audio・touch の検出経路。
 */
export function evaluate(
  spec: InteractionSpec,
  equipment: Equipment[],
  detectionMethods: DetectionMethod[] = [],
): EvaluateResult {
  const primary = spec.phenomena[0]
  if (primary === undefined) {
    return { primaryPhenomenonId: '', setups: [], notes: ['現象が一つも指定されていません'] }
  }

  const notes: string[] = []

  // 経路1: 工業用センサーの直接検出（DetectionMethod 不要）。
  const directSetups = equipment
    .filter(
      (e) =>
        e.rolesProvided.includes('sense') &&
        e.status !== 'candidate' &&
        canDetect(e, primary.sensedTarget),
    )
    .map((eq) => buildSetup(spec, primary, eq, notes))
    .filter((s): s is Setup => s !== null)

  // 経路2: 骨格/身体系は spatial ハード × DetectionMethod のペア合成。
  const spatialSetups = buildSpatialSetups(spec, primary, equipment, detectionMethods)

  const setups = [...directSetups, ...spatialSetups]
  annotatePareto(setups) // 成立案の被支配を注記（破壊的でなく注記のみ）。

  if (setups.length === 0 && notes.length === 0) {
    notes.push(
      `現象「${primary.sensedTarget}」を直接検出できる active な機材が機材DBに無いか、未対応カテゴリです。`,
    )
  }

  return { primaryPhenomenonId: primary.id, setups, notes }
}

/** spatial 経路: ハード×検出ソフトの互換ペアを列挙し、必要解像を出せるものを Setup 化。 */
function buildSpatialSetups(
  spec: InteractionSpec,
  phenomenon: Phenomenon,
  equipment: Equipment[],
  detectionMethods: DetectionMethod[],
): Setup[] {
  if (!isSkeletalTarget(phenomenon.sensedTarget)) return []

  const hardware = equipment.filter(
    (e): e is SpatialEquipment =>
      isSpatial(e) && e.rolesProvided.includes('sense') && e.status !== 'candidate',
  )

  const out: Setup[] = []
  for (const hw of hardware) {
    for (const dm of detectionMethods) {
      if (!isCompatible(hw, dm)) continue
      const targets = resolvableTargets(hw, dm)
      if (!targets.includes(phenomenon.sensedTarget)) continue
      out.push(buildSpatialSetup(spec, phenomenon, hw, dm, targets))
    }
  }
  return out
}

function buildSpatialSetup(
  spec: InteractionSpec,
  phenomenon: Phenomenon,
  hw: SpatialEquipment,
  dm: DetectionMethod,
  targets: string[],
): Setup {
  const { comfortAllowanceMs, tolerableAllowanceMs } = sensorLatencyAllowance(spec)
  const users = spec.context.simultaneousUsers ?? 1
  const totalCostJPY = pairCostJPY(hw, dm)

  const conditions: Condition[] = [
    precisionCondition(phenomenon.sensedTarget, targets),
    trackingCapacityCondition(users, pairMaxBodies(hw, dm)),
    latencyCondition(pairLatencyMs(hw, dm), comfortAllowanceMs, tolerableAllowanceMs),
    budgetCondition(totalCostJPY, spec.context.budgetJPY),
  ]

  const lit = lightingCondition(spec.context.lighting, hw, consumedModality(hw, dm))
  if (lit) conditions.push(lit)

  const requiredFeedback: FeedbackKind[] = (spec.feedback ?? []).map((f) => f.kind)
  const fb = feedbackCondition(requiredFeedback, new Set(hw.providesFeedback ?? []))
  if (fb) conditions.push(fb)

  return {
    id: `setup-${hw.id}+${dm.id}`,
    label: `${hw.name} + ${dm.name}`,
    anchorEquipmentId: hw.id,
    channels: [{ phenomenonId: phenomenon.id, equipmentIds: [hw.id], count: 1 }],
    conditions,
    totalCostJPY,
    paretoLabels: [],
    metrics: {
      costJPY: totalCostJPY,
      latencyMs: pairLatencyMs(hw, dm),
      capacityHeadroom: pairMaxBodies(hw, dm) / users,
      robustness: detectionRobustness(dm),
      precisionRank: precisionRank(targets),
    },
  }
}

function buildSetup(
  spec: InteractionSpec,
  phenomenon: Phenomenon,
  eq: Equipment,
  notes: string[],
): Setup | null {
  if (eq.category === 'pressure-mat') {
    // タイル系は覆う面積が前提。面積の無い構想では成立し得ないので候補から外す。
    if (spec.context.area_m2 === undefined) {
      notes.push(
        `${eq.name} は面積を敷き詰める前提のため、area_m2 が無い構想では候補にできません。`,
      )
      return null
    }
    return buildPressureMatSetup(spec, phenomenon, eq, spec.context.area_m2)
  }
  // 他カテゴリは後続スライス。
  return null
}

function buildPressureMatSetup(
  spec: InteractionSpec,
  phenomenon: Phenomenon,
  mat: PressureMat,
  areaM2: number,
): Setup {
  const perMatArea = mat.area_m2 ?? (mat.dims_m ? mat.dims_m[0] * mat.dims_m[1] : 1.0)
  const coverablePerMat = perMatArea * FLOOR_PACKING_EFFICIENCY

  // タイル化: 必要面積を覆う最小枚数（論点D「1台で無理ならタイル」の床版）。
  const count = Math.max(1, Math.ceil(areaM2 / coverablePerMat))
  const coverable = count * coverablePerMat
  const totalCostJPY = mat.price.value * count

  const { comfortAllowanceMs, tolerableAllowanceMs } = sensorLatencyAllowance(spec)

  // 独立して読めるゾーン数。single 配線は何枚並べても1論理ゾーン（踏み有無のみ）、
  // multi はタイル毎にアドレス可（枚数＝ゾーン数）。
  const addressableZones = mat.zones === 'multi' ? count : 1
  const discrimination = phenomenon.discrimination ?? 'occupancy'
  // 人数未指定は1人とみなす（occupancy では結果に影響しない）。
  const users = spec.context.simultaneousUsers ?? 1

  const conditions: Condition[] = [
    tiledFloorAreaCondition(areaM2, coverable, count),
    capacityCondition(users, addressableZones, discrimination),
    latencyCondition(mat.responseTimeMs, comfortAllowanceMs, tolerableAllowanceMs),
    budgetCondition(totalCostJPY, spec.context.budgetJPY),
  ]

  // フィードバック（出力）軸: 床演出などを Setup の機材が満たすか。
  const requiredFeedback: FeedbackKind[] = (spec.feedback ?? []).map((f) => f.kind)
  const providedFeedback = new Set<FeedbackKind>(mat.providesFeedback ?? [])
  const fb = feedbackCondition(requiredFeedback, providedFeedback)
  if (fb) conditions.push(fb)

  const paretoLabels = mat.providesFeedback?.includes('floor-visual')
    ? ['床演出一体', '最堅牢']
    : ['最堅牢', 'オクルージョン無縁']

  return {
    id: `setup-${mat.id}`,
    label: `${mat.name} ×${count}`,
    anchorEquipmentId: mat.id,
    channels: [{ phenomenonId: phenomenon.id, equipmentIds: [mat.id], count }],
    conditions,
    totalCostJPY,
    paretoLabels,
    metrics: {
      costJPY: totalCostJPY,
      latencyMs: mat.responseTimeMs,
      // occupancy はトリガーのみ＝定員無制限。zoned/per-user は独立ゾーン数で余裕を測る。
      capacityHeadroom: discrimination === 'occupancy' ? Infinity : addressableZones / users,
      robustness: 3, // 工業センサーは堅牢・オクルージョン無縁。
      precisionRank: 1,
    },
    mountPlan: {
      equipmentId: mat.id,
      count,
      layout: `${count} 枚を床にタイル敷設（充填効率 ${FLOOR_PACKING_EFFICIENCY}）`,
    },
  }
}
