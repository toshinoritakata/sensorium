import { z } from 'zod'

/** モダリティ間干渉ルール（sensingMethod タグの組で発火）。 */
export const InterferenceRuleSchema = z.object({
  id: z.string(),
  between: z.array(z.string()).length(2),
  type: z.string(),
  trigger: z.string(),
  effect: z.string(),
  mitigation: z.string(),
  severity: z.enum(['high', 'med', 'low']),
  mitigationReducesTo: z.enum(['warn', 'ok']),
  confidence: z.string(),
  notes: z.string().optional(),
})

export type InterferenceRule = z.infer<typeof InterferenceRuleSchema>

export const InterferenceSeedFileSchema = z.object({
  _meta: z.unknown().optional(),
  interferenceRules: z.array(InterferenceRuleSchema),
})
