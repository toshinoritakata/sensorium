import { isFeasible, type DetectionMethod, type Setup } from '@sensorium/shared'

/**
 * Pareto フロンティア（論点B 段2）。多軸で「どの軸でも他案に勝てない＝被支配」案だけを
 * frontier から外す消去法。重みを決めて総合1位を作らない（○×採点しない設計と一致）。
 *
 * 軸（すべて「高いほど良い」向きに揃えて比較）:
 *  cost(安いほど良い→ <=), latency(低いほど良い→ <=),
 *  capacityHeadroom(多いほど良い→ >=), robustness(高いほど良い→ >=),
 *  precisionRank(細かいほど良い→ >=)。
 * 軸を5本に保つのは保守的な剪定のため（未モデル要因=作動距離等で誤って消さない）。
 */
export type Metrics = {
  costJPY: number
  latencyMs: number
  capacityHeadroom: number
  robustness: number
  precisionRank: number
}

const ROBUSTNESS_SCORE = { low: 1, med: 2, high: 3 } as const

const FAMILY_ROBUSTNESS: Record<string, keyof typeof ROBUSTNESS_SCORE> = {
  'vendor-sdk': 'high',
  'ml-pose': 'med',
  'object-detection': 'med',
  'classical-cv': 'low',
  asr: 'med',
  custom: 'med',
}

/** 検出ソフトの堅牢性スコア。明示タグ優先、無ければ流派から、最後は med。 */
export function detectionRobustness(dm: DetectionMethod): number {
  const tag =
    dm.robustness ?? (dm.algorithmFamily ? FAMILY_ROBUSTNESS[dm.algorithmFamily] : 'med')
  return ROBUSTNESS_SCORE[tag ?? 'med']
}

const TARGET_RANK: Record<string, number> = {
  presence: 1,
  fullBody: 2,
  limbs: 3,
  hands: 4,
  fingers: 5,
}

/** 解像の細かさランク（指 > 手 > 四肢 > 全身 > 存在）。 */
export function precisionRank(targets: readonly string[]): number {
  return Math.max(1, ...targets.map((t) => TARGET_RANK[t] ?? 1))
}

function dominates(a: Metrics, b: Metrics): boolean {
  const betterOrEqual =
    a.costJPY <= b.costJPY &&
    a.latencyMs <= b.latencyMs &&
    a.capacityHeadroom >= b.capacityHeadroom &&
    a.robustness >= b.robustness &&
    a.precisionRank >= b.precisionRank
  const strictlyBetter =
    a.costJPY < b.costJPY ||
    a.latencyMs < b.latencyMs ||
    a.capacityHeadroom > b.capacityHeadroom ||
    a.robustness > b.robustness ||
    a.precisionRank > b.precisionRank
  return betterOrEqual && strictlyBetter
}

/**
 * 成立する案の中で被支配かどうかを各 Setup に注記（破壊的でなく注記のみ）。
 * 不成立（fail あり）の案は frontier の対象外（paretoOptimal=false）だが、理由を残すため削除しない。
 */
export function annotatePareto(setups: Setup[]): void {
  const feasible = setups.filter((s) => isFeasible(s) && s.metrics)
  for (const s of setups) {
    if (!isFeasible(s) || !s.metrics) {
      s.paretoOptimal = false
      s.dominatedBy = []
      continue
    }
    const dominators = feasible.filter(
      (o) => o !== s && o.metrics !== undefined && dominates(o.metrics, s.metrics!),
    )
    s.paretoOptimal = dominators.length === 0
    s.dominatedBy = dominators.map((o) => o.id)
  }
}
