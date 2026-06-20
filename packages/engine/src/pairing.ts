import { assertNever, type DetectionMethod, type Equipment, type InputModality } from '@feasisense/shared'

/** spatial 光学ハードウェア（depthType を持つ category:'spatial'）。 */
export type SpatialEquipment = Extract<Equipment, { category: 'spatial' }>

export function isSpatial(e: Equipment): e is SpatialEquipment {
  return e.category === 'spatial'
}

/**
 * ハードが出せるストリーム。seed の producesModality を優先、無ければ depthType/sensingMethod から導出。
 * 例外（Leap=IRのみ等）は seed の producesModality で上書きする。
 */
export function producesModality(hw: SpatialEquipment): InputModality[] {
  if (hw.producesModality) return hw.producesModality
  switch (hw.depthType) {
    case 'tof':
    case 'active-stereo':
      return ['depth', 'ir', 'rgb']
    case 'passive-stereo':
      return ['depth', 'rgb']
    case 'lidar':
      return ['pointcloud']
    case 'none':
      return hw.sensingMethod.includes('marker-mocap') ? ['ir'] : ['rgb']
    default:
      // depthType を増やしたらここがコンパイルエラーになる（網羅性の番人）。
      return assertNever(hw.depthType, 'depthType')
  }
}

/** 検出ソフトが消費するストリーム。seed の inputModality を優先、無ければ compatibleWith から導出。 */
export function inputModality(dm: DetectionMethod): InputModality[] {
  if (dm.inputModality) return dm.inputModality
  const c = dm.compatibleWith
  if (c.sensingMethod?.includes('acoustic-mic')) return ['audio']
  if (c.depthType?.includes('none')) return ['rgb']
  if (c.depthType?.includes('lidar')) return ['pointcloud']
  if (c.depthType && c.depthType.length > 0) return ['depth']
  return ['rgb']
}

/**
 * ハードと DetectionMethod が組めるか。
 * 固定ペア（equipmentIds 指定: ZED/Leap/OptiTrack 等）は機種限定、それ以外はモダリティ整合で判定。
 */
export function isCompatible(hw: SpatialEquipment, dm: DetectionMethod): boolean {
  const c = dm.compatibleWith
  // equipmentIds 指定は「固定ペア」。指定があればその機種に限定する。
  if (c.equipmentIds && c.equipmentIds.length > 0) {
    return c.equipmentIds.includes(hw.id)
  }
  // ハードが出すモダリティ ⊇ ソフトが要るモダリティ（一つでも噛み合えば可）。
  const hwMods = producesModality(hw)
  return inputModality(dm).some((m) => hwMods.includes(m))
}

/** このペアで実際に使われるストリーム（lighting 評価に渡す）。 */
export function consumedModality(
  hw: SpatialEquipment,
  dm: DetectionMethod,
): InputModality | undefined {
  const hwMods = producesModality(hw)
  return inputModality(dm).find((m) => hwMods.includes(m))
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
