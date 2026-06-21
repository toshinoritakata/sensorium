import { describe, expect, it } from 'vitest'
import type { FeedbackKind } from '@sensorium/shared'
import {
  budgetCondition,
  capacityCondition,
  feedbackCondition,
  latencyCondition,
  tiledFloorAreaCondition,
} from '../src/dimensions/index'

describe('latencyCondition — comfort/tolerable の境界', () => {
  // comfortAllowance=35, tolerableAllowance=85（normal の例）。
  it('予算内は ok', () => {
    expect(latencyCondition(20, 35, 85).status).toBe('ok')
  })
  it('comfort 超〜tolerable 以内は warn', () => {
    expect(latencyCondition(50, 35, 85).status).toBe('warn')
  })
  it('tolerable 超は fail', () => {
    expect(latencyCondition(100, 35, 85).status).toBe('fail')
  })
  it('境界 comfortAllowance ちょうどは ok', () => {
    expect(latencyCondition(35, 35, 85).status).toBe('ok')
  })
})

describe('budgetCondition — 予算帯と未指定', () => {
  it('0.9 未満は ok', () => {
    expect(budgetCondition(560_000, 800_000).status).toBe('ok')
  })
  it('1.1 超は fail', () => {
    expect(budgetCondition(560_000, 300_000).status).toBe('fail')
  })
  it('0.9 ちょうどは warn', () => {
    expect(budgetCondition(720_000, 800_000).status).toBe('warn')
  })
  it('予算未指定なら情報表示（ok / severity:info）', () => {
    const c = budgetCondition(560_000)
    expect(c.status).toBe('ok')
    expect(c.severity).toBe('info')
    expect(c.currentValue).toBe(560_000)
  })
})

describe('feedbackCondition — 出力の充足', () => {
  const floor: FeedbackKind[] = ['floor-visual']

  it('要求なしなら条件を出さない（null）', () => {
    expect(feedbackCondition([], new Set())).toBeNull()
  })
  it('一体で提供できれば ok', () => {
    expect(feedbackCondition(floor, new Set<FeedbackKind>(['floor-visual']))?.status).toBe('ok')
  })
  it('出せない出力があれば fail', () => {
    expect(feedbackCondition(floor, new Set<FeedbackKind>())?.status).toBe('fail')
  })
})

describe('capacityCondition — 空間弁別で意味が変わる', () => {
  it('occupancy は人数非依存で ok（severity:info）', () => {
    const c = capacityCondition(100, 1, 'occupancy')
    expect(c.status).toBe('ok')
    expect(c.severity).toBe('info')
  })
  it('zoned × 単一ゾーンは fail', () => {
    expect(capacityCondition(4, 1, 'zoned').status).toBe('fail')
  })
  it('zoned × 十分なゾーンは ok', () => {
    expect(capacityCondition(4, 14, 'zoned').status).toBe('ok')
  })
  it('zoned × 0.8 ちょうどは warn', () => {
    expect(capacityCondition(4, 5, 'zoned').status).toBe('warn')
  })
  it('per-user も独立ゾーンを要する', () => {
    expect(capacityCondition(4, 1, 'per-user').status).toBe('fail')
  })
})

describe('tiledFloorAreaCondition — タイルは枚数で充足', () => {
  it('常に ok、カバー面積と必要面積を残す', () => {
    const c = tiledFloorAreaCondition(12, 12.6, 14)
    expect(c.status).toBe('ok')
    expect(c.currentValue).toBe(12.6)
    expect(c.threshold).toBe(12)
  })
})
