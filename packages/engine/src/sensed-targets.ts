import type { Equipment, EquipmentCategory } from '@sensorium/shared'

/**
 * 工業用センサー系は DetectionMethod 無しで category から直接 sensedTarget が決まる
 * （data/equipment.schema.md の category→sensedTarget 表）。
 * spatial/touch/audio は DetectionMethod ペアで決まるため、ここでは扱わない（後続スライス）。
 */
const CATEGORY_TARGETS: Partial<Record<EquipmentCategory, readonly string[]>> = {
  'presence-point': ['objectPresence', 'zoneCrossing'],
  'distance-1d': ['distance1d'],
  'area-curtain': ['zoneCrossing'],
  'pressure-mat': ['step', 'weight'],
  'motion-pir': ['motion', 'presence'],
  'radar-presence': ['presence', 'distance1d', 'gesture', 'count'],
}

/** この機材が（単体で）直接出せる sensedTarget の集合。 */
export function directSensedTargets(eq: Equipment): readonly string[] {
  return CATEGORY_TARGETS[eq.category] ?? []
}

/** 機材が現象を直接検出できるか（成立ゲートの一次フィルタ）。 */
export function canDetect(eq: Equipment, sensedTarget: string): boolean {
  return directSensedTargets(eq).includes(sensedTarget)
}

/**
 * 骨格/身体系の sensedTarget。これらは spatial ハード × DetectionMethod の
 * ペアで解像が決まる（直接出力ではない）。
 */
const SKELETAL_TARGETS = ['presence', 'fullBody', 'limbs', 'hands', 'fingers'] as const

export function isSkeletalTarget(sensedTarget: string): boolean {
  return (SKELETAL_TARGETS as readonly string[]).includes(sensedTarget)
}
