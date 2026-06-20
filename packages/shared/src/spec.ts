import { z } from 'zod'

/**
 * InteractionSpec — 体験の構造化構想。エンジンの入力（唯一の真実 = フォーム）。
 * provenance は入口でブロックしない原則（stated/inferred/assumed）。
 */

export const Responsiveness = z.enum(['tight', 'normal', 'relaxed'])
export const Lighting = z.enum(['controlled', 'mixed', 'bright', 'dark', 'outdoor'])
export const AmbientNoise = z.enum(['quiet', 'moderate', 'loud'])
export const Provenance = z.enum(['stated', 'inferred', 'assumed'])

/** 検出すべき現象（SensedPhenomenon）。sensedTarget で必要解像を指す。 */
export const PhenomenonSchema = z.object({
  id: z.string(),
  sensedTarget: z.string(),
  label: z.string().optional(),
  provenance: Provenance.optional(),
})

export type Phenomenon = z.infer<typeof PhenomenonSchema>

export const InteractionSpecSchema = z.object({
  id: z.string(),
  title: z.string(),
  context: z.object({
    area_m2: z.number().positive(),
    simultaneousUsers: z.number().int().positive(),
    responsiveness: Responsiveness,
    lighting: Lighting.optional(),
    ambientNoise: AmbientNoise.optional(),
    budgetJPY: z.number().positive().optional(),
    usageModel: z.string().optional(),
  }),
  phenomena: z.array(PhenomenonSchema).min(1),
})

export type InteractionSpec = z.infer<typeof InteractionSpecSchema>
