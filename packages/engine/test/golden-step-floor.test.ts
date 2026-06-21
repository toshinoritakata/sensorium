import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EquipmentSeedFileSchema,
  isFeasible,
  type Equipment,
  type EvaluateResult,
  type InteractionSpec,
  type Setup,
} from '@sensorium/shared'
import { evaluate } from '../src/index'

const setupOf = (r: EvaluateResult, anchorId: string): Setup =>
  r.setups.find((s) => s.anchorEquipmentId === anchorId)!

const statuses = (s: Setup): Record<string, string> =>
  Object.fromEntries(s.conditions.map((c) => [c.dimension, c.status]))

/** 実シードから機材を読み込む（ゴールデンテストは実データに固定する）。 */
function loadEquipment(): Equipment[] {
  const files = ['data/equipment.seed.json', 'data/industrial-sensors.seed.json']
  return files.flatMap((rel) => {
    const url = new URL(`../../../${rel}`, import.meta.url)
    const json = JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
    return EquipmentSeedFileSchema.parse(json).equipment
  })
}

/** 「踏んだら反応する床」= step 現象の最小 Spec。 */
function stepFloorSpec(
  overrides: Partial<InteractionSpec['context']> = {},
  feedback?: InteractionSpec['feedback'],
): InteractionSpec {
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
    feedback,
  }
}

describe('golden: 踏んだら反応する床（step → 感圧マット）', () => {
  const equipment = loadEquipment()

  it('step を直接検出する2案（感圧マット / LEDフロア）が並ぶ', () => {
    const result = evaluate(stepFloorSpec(), equipment)
    expect(result.primaryPhenomenonId).toBe('ph-step')
    expect(result.setups.map((s) => s.anchorEquipmentId).sort()).toEqual([
      'interactive-led-floor',
      'pressure-safety-mat',
    ])
  })

  it('感圧マット案: 台数・総額・各条件が決定論的に定まる', () => {
    const setup = setupOf(evaluate(stepFloorSpec(), equipment), 'pressure-safety-mat')

    // 12m² ÷ (1.0m² × 0.9 充填) = 13.33 → 14 枚。
    expect(setup.mountPlan?.count).toBe(14)
    expect(setup.channels[0]!.count).toBe(14)
    // 40,000 円 × 14 = 560,000 円。
    expect(setup.totalCostJPY).toBe(560_000)

    const byDim = statuses(setup)
    expect(byDim.area).toBe('ok') // タイルは枚数で充足。律速は予算へ。
    expect(byDim.capacity).toBe('ok') // occupancy 既定 → 人数非依存。
    expect(byDim.latency).toBe('ok') // 20ms ≤ 予算 35ms。
    expect(byDim.budget).toBe('ok') // 560,000 < 0.9×800,000。
    expect(byDim.feedback).toBeUndefined() // 出力要求が無いので条件を出さない。
    expect(isFeasible(setup)).toBe(true)
  })

  it('LEDフロア案: 同じ床を高い単価で覆い、予算に当たる', () => {
    const setup = setupOf(evaluate(stepFloorSpec(), equipment), 'interactive-led-floor')
    // 120,000 円 × 14 = 1,680,000 円 → 0.9×800,000 を超え fail。
    expect(setup.totalCostJPY).toBe(1_680_000)
    expect(statuses(setup).budget).toBe('fail')
    expect(setup.paretoLabels).toContain('床演出一体')
  })

  it('予算を絞ると、センシングは成立しても budget が fail になる（operating envelope）', () => {
    const setup = setupOf(
      evaluate(stepFloorSpec({ budgetJPY: 300_000 }), equipment),
      'pressure-safety-mat',
    )
    expect(statuses(setup).budget).toBe('fail') // 560,000 > 1.1×300,000。
    expect(isFeasible(setup)).toBe(false)
    // 面積は枚数を増やせば常に覆えるので fail にはならない。
    expect(statuses(setup).area).not.toBe('fail')
  })

  it('床が光る要求があると、感圧マット案は feedback で落ち LEDフロア案が残る', () => {
    const spec = stepFloorSpec({ budgetJPY: 3_000_000 }, [
      { id: 'fb-1', kind: 'floor-visual', label: '踏むと床が光る', provenance: 'stated' },
    ])
    const result = evaluate(spec, equipment)

    const mat = setupOf(result, 'pressure-safety-mat')
    expect(statuses(mat).feedback).toBe('fail') // 床を光らせられない。
    expect(isFeasible(mat)).toBe(false)

    const led = setupOf(result, 'interactive-led-floor')
    expect(statuses(led).feedback).toBe('ok') // floor-visual 一体。
    expect(statuses(led).budget).toBe('ok') // 1,680,000 < 0.9×3,000,000。
    expect(isFeasible(led)).toBe(true)
  })

  it('広い床はタイル枚数が増え、総額も比例する（面積は ok のまま、律速は予算）', () => {
    const setup = setupOf(
      evaluate(stepFloorSpec({ area_m2: 30, budgetJPY: 2_000_000 }), equipment),
      'pressure-safety-mat',
    )
    expect(setup.mountPlan?.count).toBe(34) // 30 ÷ 0.9 = 33.33 → 34。
    expect(setup.totalCostJPY).toBe(34 * 40_000)
    expect(statuses(setup).area).toBe('ok')
  })

  it('ゾーン弁別が要ると、単一ゾーンの安全マットは capacity で落ち、LEDフロアは通る', () => {
    const spec = stepFloorSpec({ budgetJPY: 3_000_000 })
    spec.phenomena[0]!.discrimination = 'zoned' // どのタイルを踏んだか局所応答が要る。

    const result = evaluate(spec, equipment)

    // 安全マット: single 配線 → 1論理ゾーン。4人 / 1 = fail。
    const mat = setupOf(result, 'pressure-safety-mat')
    expect(statuses(mat).capacity).toBe('fail')
    expect(isFeasible(mat)).toBe(false)

    // LEDフロア: multi → タイル毎アドレス可。4人 / 14ゾーン → ok。
    const led = setupOf(result, 'interactive-led-floor')
    expect(statuses(led).capacity).toBe('ok')
    expect(isFeasible(led)).toBe(true)
  })

  it('即応 tight では LEDフロア(30ms)が latency warn、安全マット(20ms)は ok', () => {
    const result = evaluate(
      stepFloorSpec({ responsiveness: 'tight', budgetJPY: 3_000_000 }),
      equipment,
    )
    // tight: comfortAllowance=25, tolerableAllowance=55。
    expect(statuses(setupOf(result, 'interactive-led-floor')).latency).toBe('warn')
    expect(statuses(setupOf(result, 'pressure-safety-mat')).latency).toBe('ok')
  })

  it('weight 現象も感圧マットが直接検出して候補化する', () => {
    const spec = stepFloorSpec()
    spec.phenomena[0] = { id: 'ph-weight', sensedTarget: 'weight', label: '乗った重さ' }
    const result = evaluate(spec, equipment)
    expect(result.primaryPhenomenonId).toBe('ph-weight')
    expect(result.setups.map((s) => s.anchorEquipmentId)).toContain('pressure-safety-mat')
  })

  it('予算未指定なら budget は情報表示（fail にならず成立する）', () => {
    const spec = stepFloorSpec({ budgetJPY: undefined })
    const setup = setupOf(evaluate(spec, equipment), 'pressure-safety-mat')
    const budget = setup.conditions.find((c) => c.dimension === 'budget')!
    expect(budget.severity).toBe('info')
    expect(budget.currentValue).toBe(560_000)
    expect(isFeasible(setup)).toBe(true)
  })

  it('面積の無い構想ではタイル系（感圧マット）は候補から外れ、理由を残す', () => {
    const spec: InteractionSpec = {
      id: 'spec-no-area',
      title: '面積を持たない踏み（キオスク足元の一点）',
      context: { responsiveness: 'normal' }, // area_m2 も simultaneousUsers も無し。
      phenomena: [{ id: 'ph-step', sensedTarget: 'step', label: '踏む' }],
    }
    const result = evaluate(spec, equipment)
    expect(result.setups).toHaveLength(0)
    expect(result.notes?.some((n) => n.includes('面積'))).toBe(true)
  })

  it('直接検出できない現象（voiceCommand）は候補ゼロで理由を返す', () => {
    const spec: InteractionSpec = {
      id: 'spec-voice',
      title: '声で反応',
      context: { area_m2: 6, simultaneousUsers: 1, responsiveness: 'relaxed' },
      phenomena: [{ id: 'ph-voice', sensedTarget: 'voiceCommand', label: '音声コマンド' }],
    }
    const result = evaluate(spec, equipment)
    expect(result.setups).toHaveLength(0)
    expect(result.notes?.length ?? 0).toBeGreaterThan(0)
  })
})
