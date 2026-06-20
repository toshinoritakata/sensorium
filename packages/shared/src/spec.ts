import { z } from 'zod'
import { FeedbackKind } from './feedback'

/**
 * InteractionSpec — 体験の構造化構想。エンジンの入力（唯一の真実 = フォーム）。
 * provenance は入口でブロックしない原則（stated/inferred/assumed）。
 */

export const Responsiveness = z.enum(['tight', 'normal', 'relaxed'])
export type Responsiveness = z.infer<typeof Responsiveness>
export const Lighting = z.enum(['controlled', 'mixed', 'bright', 'dark', 'outdoor'])
export type Lighting = z.infer<typeof Lighting>
export const AmbientNoise = z.enum(['quiet', 'moderate', 'loud'])
export type AmbientNoise = z.infer<typeof AmbientNoise>
export const Provenance = z.enum(['stated', 'inferred', 'assumed'])
export type Provenance = z.infer<typeof Provenance>

/**
 * 空間弁別の要求度。capacity 次元の意味を決める。
 * - occupancy: 「誰か/何かが居る・踏んだ」のトリガーのみ（人数に依存しない）
 * - zoned: どのゾーンか（局所応答が要る＝独立ゾーンが人数分要る）
 * - per-user: 個人を継続追跡・識別する
 */
export const Discrimination = z.enum(['occupancy', 'zoned', 'per-user'])
export type Discrimination = z.infer<typeof Discrimination>

/** 検出すべき現象（SensedPhenomenon）。sensedTarget で必要解像を指す。 */
export const PhenomenonSchema = z.object({
  id: z.string(),
  sensedTarget: z.string(),
  label: z.string().optional(),
  /** 空間弁別の要求度（未指定なら occupancy = トリガーのみ）。 */
  discrimination: Discrimination.optional(),
  provenance: Provenance.optional(),
})

export type Phenomenon = z.infer<typeof PhenomenonSchema>

/** 体験が必要とする出力（床が光る等）。検出と別軸。 */
export const FeedbackNeedSchema = z.object({
  id: z.string(),
  kind: FeedbackKind,
  label: z.string().optional(),
  provenance: Provenance.optional(),
})

export type FeedbackNeed = z.infer<typeof FeedbackNeedSchema>

export const InteractionSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  context: z.object({
    // 面積は「現象しだいの文脈」。床/面を覆う体験だけが要求する（普遍の必須ではない）。
    area_m2: z.number().positive().optional(),
    simultaneousUsers: z.number().int().positive().optional(),
    responsiveness: Responsiveness,
    lighting: Lighting.optional(),
    ambientNoise: AmbientNoise.optional(),
    budgetJPY: z.number().positive().optional(),
    usageModel: z.string().optional(),
  }),
  phenomena: z.array(PhenomenonSchema).min(1),
  /** 必要な出力。未指定なら検出のみ評価。 */
  feedback: z.array(FeedbackNeedSchema).optional(),
})

export type InteractionSpec = z.infer<typeof InteractionSpecSchema>
