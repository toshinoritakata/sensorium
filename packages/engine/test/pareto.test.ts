import { describe, expect, it } from 'vitest'
import type { EvaluateResult, InteractionSpec, Setup } from '@feasisense/shared'
import { evaluate } from '../src/index'
import { loadAllDetectionMethods, loadAllEquipment } from '../src/load-seeds'

const equipment = loadAllEquipment()
const detectionMethods = loadAllDetectionMethods()

const byId = (r: EvaluateResult, id: string): Setup | undefined =>
  r.setups.find((s) => s.id === id)

function stepFloor(over: Partial<InteractionSpec['context']> = {}, feedback?: InteractionSpec['feedback']): InteractionSpec {
  return {
    id: 'spec-step',
    title: '踏んだら反応する床',
    context: { area_m2: 12, simultaneousUsers: 4, responsiveness: 'normal', budgetJPY: 800_000, ...over },
    phenomena: [{ id: 'ph-step', sensedTarget: 'step', label: '床を踏む' }],
    feedback,
  }
}

function handsKiosk(): InteractionSpec {
  return {
    id: 'spec-hands',
    title: 'キオスクで手を振る',
    context: { simultaneousUsers: 1, responsiveness: 'normal', lighting: 'controlled', budgetJPY: 300_000 },
    phenomena: [{ id: 'ph-hands', sensedTarget: 'hands', label: '手の検出' }],
  }
}

describe('Pareto: 被支配案を frontier から外す', () => {
  it('床演出が不要なら、LEDフロアは感圧マットに支配される（劣位）', () => {
    // 両案を予算内に収め、不成立でなく「支配」で外れることを見る。
    const r = evaluate(stepFloor({ budgetJPY: 3_000_000 }), equipment, detectionMethods)
    expect(byId(r, 'setup-pressure-safety-mat')!.paretoOptimal).toBe(true)
    const led = byId(r, 'setup-interactive-led-floor')!
    expect(led.paretoOptimal).toBe(false) // 高い・遅い・センシングは同等。
    expect(led.dominatedBy).toContain('setup-pressure-safety-mat')
  })

  it('床演出が要れば、感圧マットは不成立になり LEDフロアが frontier に残る', () => {
    const r = evaluate(
      stepFloor({ budgetJPY: 3_000_000 }, [{ id: 'fb', kind: 'floor-visual', label: '光る' }]),
      equipment,
      detectionMethods,
    )
    expect(byId(r, 'setup-pressure-safety-mat')!.paretoOptimal).toBe(false) // feedback fail。
    expect(byId(r, 'setup-interactive-led-floor')!.paretoOptimal).toBe(true)
  })

  it('hands: より高価で全軸劣る ToF カメラ案は安価な同等案に支配される', () => {
    const r = evaluate(handsKiosk(), equipment, detectionMethods)
    // Azure Kinect(6万) は Femto Mega(17万)/Bolt(8万) を ms-body 経路で支配。
    expect(byId(r, 'setup-azure-kinect-dk+ms-body-tracking-sdk')!.paretoOptimal).toBe(true)
    expect(byId(r, 'setup-orbbec-femto-mega+ms-body-tracking-sdk')!.paretoOptimal).toBe(false)
    expect(byId(r, 'setup-orbbec-femto-bolt+ms-body-tracking-sdk')!.paretoOptimal).toBe(false)
  })

  it('hands: frontier は全候補より確実に少ない（剪定が効く）', () => {
    const r = evaluate(handsKiosk(), equipment, detectionMethods)
    const frontier = r.setups.filter((s) => s.paretoOptimal).length
    expect(frontier).toBeGreaterThan(0)
    expect(frontier).toBeLessThan(r.setups.length)
  })

  it('OpenCV 手検出が候補に入り、堅牢性が低い軸で MediaPipe と差別化される', () => {
    const r = evaluate(handsKiosk(), equipment, detectionMethods)
    const opencv = byId(r, 'setup-rgb-camera-generic+opencv-hand-contour')
    const mediapipe = byId(r, 'setup-rgb-camera-generic+mediapipe-pose')
    expect(opencv).toBeDefined()
    expect(mediapipe).toBeDefined()
    // OpenCV は低遅延だが堅牢性 low、MediaPipe は堅牢性 med。互いに支配しない＝両方 frontier。
    expect(opencv!.metrics!.robustness).toBeLessThan(mediapipe!.metrics!.robustness)
    expect(opencv!.metrics!.latencyMs).toBeLessThan(mediapipe!.metrics!.latencyMs)
  })
})
