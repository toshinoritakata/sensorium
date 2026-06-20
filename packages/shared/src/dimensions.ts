import { z } from 'zod'

/** 判定次元の定義（data/dimensions.seed.json の dimensions[]）。 */
export const DimensionSchema = z.object({
  key: z.string(),
  system: z.enum(['equipment', 'intrinsic', 'both']),
  currentValue: z.string(),
  compute: z.string(),
  evaluate: z.string(),
  softMargin: z.string(),
  confidence: z.string(),
  rationale: z.string(),
  disclaimer: z.string().optional(),
})

export type Dimension = z.infer<typeof DimensionSchema>

export const DimensionsSeedFileSchema = z.object({
  _meta: z.unknown().optional(),
  // mappings は次元ごとに形が異なる参照表。ここでは存在のみ検証する。
  mappings: z.record(z.string(), z.unknown()),
  dimensions: z.array(DimensionSchema),
})
