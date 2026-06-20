import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EquipmentSeedFileSchema,
  isFeasible,
  type Equipment,
  type InteractionSpec,
} from '@feasisense/shared'
import { evaluate } from '../src/index'

/** 実シードから機材を読み込む（ゴールデンテストは実データに固定する）。 */
function loadEquipment(): Equipment[] {
  const url = new URL('../../../data/industrial-sensors.seed.json', import.meta.url)
  const json = JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
  return EquipmentSeedFileSchema.parse(json).equipment
}

/** 「踏んだら反応する床」= step 現象の最小 Spec。 */
function stepFloorSpec(overrides: Partial<InteractionSpec['context']> = {}): InteractionSpec {
  return {
    id: 'spec-step-floor',
    title: '踏んだら反応する床',
    context: {
      area_m2: 12,
      simultaneousUsers: 4,
      responsiveness: 'normal',
      budgetJPY: 800_000,
      ...overrides,
    },
    phenomena: [{ id: 'ph-step', sensedTarget: 'step', label: '床を踏む', provenance: 'stated' }],
  }
}

describe('golden: 踏んだら反応する床（step → 感圧マット）', () => {
  const equipment = loadEquipment()

  it('感圧マットで成立し、台数・総額・各条件が決定論的に定まる', () => {
    const result = evaluate(stepFloorSpec(), equipment)

    expect(result.primaryPhenomenonId).toBe('ph-step')
    expect(result.setups).toHaveLength(1)

    const setup = result.setups[0]!
    expect(setup.anchorEquipmentId).toBe('pressure-safety-mat')

    // 12m² ÷ (1.0m² × 0.9 充填) = 13.33 → 14 枚。
    expect(setup.mountPlan?.count).toBe(14)
    expect(setup.channels[0]!.count).toBe(14)
    // 40,000 円 × 14 = 560,000 円。
    expect(setup.totalCostJPY).toBe(560_000)

    const byDim = Object.fromEntries(setup.conditions.map((c) => [c.dimension, c.status]))
    // 充足率 12/12.6 = 0.952 → 余裕なしで warn。
    expect(byDim.area).toBe('warn')
    // 4人 / 14ゾーン → ok。
    expect(byDim.capacity).toBe('ok')
    // 応答 20ms ≤ 予算 35ms（normal comfort 80 − downstream 45）→ ok。
    expect(byDim.latency).toBe('ok')
    // 560,000 < 0.9×800,000 → ok。
    expect(byDim.budget).toBe('ok')

    expect(isFeasible(setup)).toBe(true)
  })

  it('予算を絞ると、センシングは成立しても budget が fail になる（operating envelope）', () => {
    const result = evaluate(stepFloorSpec({ budgetJPY: 300_000 }), equipment)
    const setup = result.setups[0]!

    const budget = setup.conditions.find((c) => c.dimension === 'budget')!
    // 560,000 > 1.1×300,000 = 330,000 → fail。
    expect(budget.status).toBe('fail')
    expect(isFeasible(setup)).toBe(false)
    // 面積は枚数を増やせば常に覆えるので fail にはならない。
    const area = setup.conditions.find((c) => c.dimension === 'area')!
    expect(area.status).not.toBe('fail')
  })

  it('広い床はタイル枚数が増え、総額も比例する', () => {
    const result = evaluate(stepFloorSpec({ area_m2: 30, budgetJPY: 2_000_000 }), equipment)
    const setup = result.setups[0]!
    // 30 ÷ 0.9 = 33.33 → 34 枚。
    expect(setup.mountPlan?.count).toBe(34)
    expect(setup.totalCostJPY).toBe(34 * 40_000)
  })
})
