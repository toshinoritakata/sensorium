import type { DetectionMethod, Equipment } from '@feasisense/shared'

/** spatial 光学ハードウェア（depthType を持つ category:'spatial'）。 */
export type SpatialEquipment = Extract<Equipment, { category: 'spatial' }>

export function isSpatial(e: Equipment): e is SpatialEquipment {
  return e.category === 'spatial'
}

/**
 * ハードと DetectionMethod が組めるか。
 * 固定ペア（equipmentIds 指定: ZED/Leap/OptiTrack 等）か、depthType 互換で判定。
 */
export function isCompatible(hw: SpatialEquipment, dm: DetectionMethod): boolean {
  const c = dm.compatibleWith
  // equipmentIds 指定は「固定ペア」。指定があれば depthType で広げず、その機種に限定する。
  if (c.equipmentIds && c.equipmentIds.length > 0) {
    return c.equipmentIds.includes(hw.id)
  }
  if (c.depthType) return c.depthType.includes(hw.depthType)
  return false
}

/**
 * ペアの実効解像。schema: `providesTargets ∩ (depthType が許す範囲)`。
 * depthType 制約は compatibleWith 側で担保済みとし、現状は providesTargets を採用。
 * TODO(後続): passive-rgb×hands 等の marginal を warn に落とす depthType ルール。
 */
export function resolvableTargets(_hw: SpatialEquipment, dm: DetectionMethod): string[] {
  return dm.providesTargets
}

/** ペアのレイテンシ = ハードのセンサ遅延 + 検出ソフトの推論遅延。 */
export function pairLatencyMs(hw: SpatialEquipment, dm: DetectionMethod): number {
  return hw.sensorLatencyMs + dm.addedLatencyMs
}

/** ペアの追跡上限 = 検出ソフト側の maxTrackedBodies（ハード現実上限は将来 min を取る）。 */
export function pairMaxBodies(_hw: SpatialEquipment, dm: DetectionMethod): number {
  return dm.maxTrackedBodies
}

/** ペアの概算費用 = ハード価格 + ソフトライセンス。 */
export function pairCostJPY(hw: SpatialEquipment, dm: DetectionMethod): number {
  return hw.price.value + dm.license.price
}
