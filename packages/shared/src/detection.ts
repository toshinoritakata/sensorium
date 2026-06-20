import { z } from 'zod'

/** DetectionMethod（検出ソフト）。光学ハードとペアで sense role を埋める。 */
export const DetectionMethodSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string(),
  license: z.object({
    model: z.enum(['oss', 'commercial', 'bundled']),
    price: z.number(),
    verify: z.boolean(),
  }),
  compatibleWith: z.object({
    depthType: z.array(z.string()).optional(),
    sensingMethod: z.array(z.string()).optional(),
    equipmentIds: z.array(z.string()).optional(),
  }),
  providesTargets: z.array(z.string()),
  maxTrackedBodies: z.number().int(),
  addedLatencyMs: z.number(),
  computeNeed: z.string(),
  sensingMethod: z.array(z.string()).optional(),
  confidence: z.record(z.string(), z.string()).optional(),
  notes: z.string().optional(),
})

export type DetectionMethod = z.infer<typeof DetectionMethodSchema>

export const DetectionMethodSeedFileSchema = z.object({
  _meta: z.unknown().optional(),
  detectionMethods: z.array(DetectionMethodSchema),
})
