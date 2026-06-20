import { z } from 'zod'
import { FeedbackKind } from './feedback'
import { InputModality } from './modality'

/**
 * Equipment スキーマ（data/equipment.schema.md の写像）。
 * 共通ベース ＋ カテゴリ別 capability envelope の二層を、`category` の判別ユニオンで表す。
 * 既存 seed（data/equipment.seed.json / data/industrial-sensors.seed.json）を検証する単一真実。
 */

export const Role = z.enum(['sense', 'interface', 'compute', 'mount'])
export const Modality = z.enum(['gesture', 'touch', 'voice'])

const tuple2 = z.tuple([z.number(), z.number()])

export const PriceSchema = z.object({
  value: z.number(),
  currency: z.string(),
  asOf: z.string(),
  verify: z.boolean(),
})

export const InterfaceSchema = z.object({
  type: z.string(),
  spec: z.string(),
  connector: z.string(),
  maxCableLength_m: z.number(),
  power: z.string(),
})

export const SourceSchema = z
  .object({
    adapter: z.string(),
    sourceUrl: z.string().optional(),
    distributor: z.string().optional(),
    fetchedAt: z.string().optional(),
    verify: z.boolean().optional(),
  })
  .passthrough()

/** confidence / note の自由記述（スペック値ごとの信頼度メモ）。 */
const ConfidenceSchema = z.record(z.string(), z.string())

/** 全機材が共有する素地。 */
const equipmentBase = {
  id: z.string(),
  name: z.string(),
  vendor: z.string(),
  rolesProvided: z.array(Role),
  sensingMethod: z.array(z.string()),
  servesModality: z.array(Modality),
  /** この機材が一体で提供する出力（無ければ検出専用）。 */
  providesFeedback: z.array(FeedbackKind).optional(),
  price: PriceSchema,
  interface: InterfaceSchema,
  powerW: z.number(),
  computeNeed: z.string(),
  mountingNeed: z.string(),
  status: z.enum(['active', 'candidate']).optional(),
  source: SourceSchema.nullable().optional(),
  confidence: ConfidenceSchema.optional(),
  notes: z.string().optional(),
}

const base = z.object(equipmentBase)

// --- カテゴリ別 envelope --------------------------------------------------

export const SpatialEquipment = base.extend({
  category: z.literal('spatial'),
  depthType: z.enum(['tof', 'active-stereo', 'passive-stereo', 'lidar', 'none']),
  /** 出せるストリーム。未指定なら depthType/sensingMethod から導出（pairing.ts）。 */
  producesModality: z.array(InputModality).optional(),
  fovH: z.number(),
  fovV: z.number(),
  usableRange: tuple2,
  typicalCoverageArea: z.number().optional(),
  sensorLatencyMs: z.number(),
  minLux: z.number(),
  maxLux: z.number(),
  sunlightOk: z.boolean(),
  mountAdjustable: z.object({ heightRange: tuple2, tiltRange: tuple2 }),
})

export const TouchEquipment = base.extend({
  category: z.literal('touch'),
  maxSurface: tuple2,
  multitouchPoints: z.number(),
  surfaceType: z.string(),
  sensorLatencyMs: z.number(),
  proximityRange: z.number().nullable().optional(),
})

export const AudioEquipment = base.extend({
  category: z.literal('audio'),
  pickupPattern: z.string(),
  effectiveRange: z.number(),
  localizationCapable: z.boolean(),
  noiseToleranceDb: z.number(),
  channels: z.number(),
  sensorLatencyMs: z.number(),
})

/** compute/interface だけを担う補助機材（envelope なし）。 */
export const SupportEquipment = base.extend({
  category: z.literal('support'),
})

export const PresencePointEquipment = base.extend({
  category: z.literal('presence-point'),
  detectMode: z.string(),
  sensingDistance_m: z.number(),
  minTargetSize_mm: z.number(),
  responseTimeMs: z.number(),
  output: z.string(),
})

export const Distance1dEquipment = base.extend({
  category: z.literal('distance-1d'),
  measureRange_m: tuple2,
  beamAngle_deg: z.number(),
  resolution_mm: z.number(),
  responseTimeMs: z.number(),
  output: z.string(),
})

export const AreaCurtainEquipment = base.extend({
  category: z.literal('area-curtain'),
  coverageW_m: z.number(),
  coverageH_m: z.number(),
  beamPitch_mm: z.number(),
  minDetectObject_mm: z.number(),
  responseTimeMs: z.number(),
  output: z.string(),
})

export const PressureMatEquipment = base.extend({
  category: z.literal('pressure-mat'),
  area_m2: z.number().optional(),
  dims_m: tuple2.optional(),
  triggerForce_kg: z.number(),
  zones: z.enum(['single', 'multi']),
  responseTimeMs: z.number(),
  output: z.string(),
})

export const MotionPirEquipment = base.extend({
  category: z.literal('motion-pir'),
  detectionRange_m: z.number(),
  detectionAngle_deg: z.number(),
  holdTimeMs: z.number(),
  output: z.string(),
})

export const RadarPresenceEquipment = base.extend({
  category: z.literal('radar-presence'),
  range_m: z.number(),
  fov_deg: z.number(),
  capabilities: z.array(z.string()),
  responseTimeMs: z.number(),
  output: z.string(),
})

export const EquipmentSchema = z.discriminatedUnion('category', [
  SpatialEquipment,
  TouchEquipment,
  AudioEquipment,
  SupportEquipment,
  PresencePointEquipment,
  Distance1dEquipment,
  AreaCurtainEquipment,
  PressureMatEquipment,
  MotionPirEquipment,
  RadarPresenceEquipment,
])

export type Equipment = z.infer<typeof EquipmentSchema>
export type EquipmentCategory = Equipment['category']
export type PressureMat = z.infer<typeof PressureMatEquipment>

/** seed ファイル全体（_meta ＋ equipment 配列）。 */
export const EquipmentSeedFileSchema = z.object({
  _meta: z.unknown().optional(),
  equipment: z.array(EquipmentSchema),
})
