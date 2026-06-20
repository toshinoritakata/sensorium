import { z } from 'zod'
import { InputModality } from './modality'

/** 検出アルゴリズムの流派（説明/グルーピング用。エンジン判定には未使用）。 */
export const AlgorithmFamily = z.enum([
  'classical-cv',
  'ml-pose',
  'object-detection',
  'vendor-sdk',
  'asr',
  'custom',
])
export type AlgorithmFamily = z.infer<typeof AlgorithmFamily>

/** DetectionMethod（検出ソフト）。光学ハードとペアで sense role を埋める。 */
export const DetectionMethodSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string(),
  /** 消費する入力ストリーム。未指定なら compatibleWith から導出（pairing.ts）。 */
  inputModality: z.array(InputModality).optional(),
  algorithmFamily: AlgorithmFamily.optional(),
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
