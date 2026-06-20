import { z } from 'zod'

/** エンジン評価結果。evaluate(spec, equipment) → EvaluateResult。 */

export const ConditionStatus = z.enum(['ok', 'warn', 'fail'])
export type ConditionStatus = z.infer<typeof ConditionStatus>

/** 名前付き成立条件。裏は構造化、表はレポート文。全数値トレース可。 */
export const ConditionSchema = z.object({
  dimension: z.string(),
  status: ConditionStatus,
  currentValue: z.number().optional(),
  threshold: z.number().optional(),
  operator: z.string().optional(),
  rationale: z.string(),
  derivedFrom: z.string().optional(),
  severity: z.enum(['hard', 'soft', 'info']).optional(),
})

export type Condition = z.infer<typeof ConditionSchema>

/** 設置計画（このスライスでは台数のみ。幾何=spatial は後続）。 */
export const MountPlanSchema = z.object({
  equipmentId: z.string(),
  count: z.number().int().positive(),
  layout: z.string().optional(),
})

export type MountPlan = z.infer<typeof MountPlanSchema>

/** 1 現象 = 1 検出系統。 */
export const ChannelSchema = z.object({
  phenomenonId: z.string(),
  equipmentIds: z.array(z.string()),
  count: z.number().int().positive(),
})

export type Channel = z.infer<typeof ChannelSchema>

/** 機材構成1案（主 Channel の sense でアンカー）。 */
export const SetupSchema = z.object({
  id: z.string(),
  label: z.string(),
  anchorEquipmentId: z.string(),
  channels: z.array(ChannelSchema),
  conditions: z.array(ConditionSchema),
  totalCostJPY: z.number(),
  paretoLabels: z.array(z.string()),
  mountPlan: MountPlanSchema.optional(),
})

export type Setup = z.infer<typeof SetupSchema>

export const EvaluateResultSchema = z.object({
  primaryPhenomenonId: z.string(),
  setups: z.array(SetupSchema),
  notes: z.array(z.string()).optional(),
})

export type EvaluateResult = z.infer<typeof EvaluateResultSchema>

/** Setup が成立する（fail 条件が無い）か。 */
export function isFeasible(setup: Setup): boolean {
  return setup.conditions.every((c) => c.status !== 'fail')
}
