import { describe, expect, it } from 'vitest'
import { isFeasible, type EvaluateResult, type InteractionSpec, type Setup } from '@feasisense/shared'
import { evaluate } from '../src/index'
import { loadAllDetectionMethods, loadAllEquipment } from '../src/load-seeds'

const equipment = loadAllEquipment()
const detectionMethods = loadAllDetectionMethods()

const byId = (r: EvaluateResult, id: string): Setup | undefined =>
  r.setups.find((s) => s.id === id)
const statuses = (s: Setup): Record<string, string> =>
  Object.fromEntries(s.conditions.map((c) => [c.dimension, c.status]))

/** キオスクで手を振る = 面積なし・hands 現象。 */
function handsSpec(over: Partial<InteractionSpec['context']> = {}): InteractionSpec {
  return {
    id: 'spec-hands',
    title: 'キオスクで手を振る',
    context: { simultaneousUsers: 1, responsiveness: 'tight', lighting: 'controlled', ...over },
    phenomena: [{ id: 'ph-hands', sensedTarget: 'hands', label: '手の検出' }],
  }
}

describe('spatial: 手の検出（ハード × 検出ソフトのペア合成）', () => {
  it('面積が無くても hands は複数のペア案を生む', () => {
    const result = evaluate(handsSpec({ budgetJPY: 200_000 }), equipment, detectionMethods)
    expect(result.setups.length).toBeGreaterThan(3)
    const anchors = new Set(result.setups.map((s) => s.anchorEquipmentId))
    expect(anchors.has('ultraleap-lmc2')).toBe(true)
    expect(anchors.has('rgb-camera-generic')).toBe(true)
  })

  it('Leap + Ultraleap: 指まで解像・低遅延・安価で成立', () => {
    const result = evaluate(handsSpec({ budgetJPY: 200_000 }), equipment, detectionMethods)
    const s = byId(result, 'setup-ultraleap-lmc2+ultraleap-hand-tracking')!
    const d = statuses(s)
    expect(d.precision).toBe('ok')
    expect(d.latency).toBe('ok') // 10+10=20ms ≤ tight 予算 25ms。
    expect(d.capacity).toBe('ok') // 1人 / 上限2。
    expect(d.budget).toBe('ok') // 20,000円。
    expect(d.lighting).toBe('ok')
    expect(isFeasible(s)).toBe(true)
  })

  it('固定ペアの DetectionMethod は depthType で広がらない（RealSense+Ultraleap は生じない）', () => {
    const result = evaluate(handsSpec({ budgetJPY: 200_000 }), equipment, detectionMethods)
    expect(byId(result, 'setup-realsense-d455+ultraleap-hand-tracking')).toBeUndefined()
  })

  it('RGB + MediaPipe: 安いが tight では latency warn・単一人物で capacity warn', () => {
    const result = evaluate(handsSpec({ budgetJPY: 200_000 }), equipment, detectionMethods)
    const s = byId(result, 'setup-rgb-camera-generic+mediapipe-pose')!
    const d = statuses(s)
    expect(d.latency).toBe('warn') // 30+25=55ms、tight 許容 55ms ぎりぎり。
    expect(d.capacity).toBe('warn') // 上限1人に1人 = 充足率1.0。
    expect(isFeasible(s)).toBe(true) // warn のみなので成立。
  })

  it('屋外光では ToF 機（sunlightOk=false）は lighting fail、RGB は通る', () => {
    const result = evaluate(handsSpec({ budgetJPY: 200_000, lighting: 'outdoor' }), equipment, detectionMethods)

    const tof = byId(result, 'setup-azure-kinect-dk+ms-body-tracking-sdk')!
    expect(statuses(tof).lighting).toBe('fail')
    expect(isFeasible(tof)).toBe(false)

    const rgb = byId(result, 'setup-rgb-camera-generic+mediapipe-pose')!
    expect(statuses(rgb).lighting).toBe('ok')
  })

  it('DetectionMethod を渡さなければ spatial 候補は出ない（後方互換）', () => {
    const result = evaluate(handsSpec({ budgetJPY: 200_000 }), equipment)
    expect(result.setups).toHaveLength(0)
    expect(result.notes?.length ?? 0).toBeGreaterThan(0)
  })
})
