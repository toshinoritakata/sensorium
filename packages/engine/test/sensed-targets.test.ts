import { describe, expect, it } from 'vitest'
import type { Equipment } from '@sensorium/shared'
import { canDetect, directSensedTargets } from '../src/sensed-targets'
import { loadAllEquipment } from '../src/load-seeds'

const byId = (eq: Equipment[], id: string): Equipment => eq.find((e) => e.id === id)!

describe('sensed-targets — category から直接 sensedTarget を引く', () => {
  const equipment = loadAllEquipment()

  it('感圧マットは step と weight を直接検出できる', () => {
    const mat = byId(equipment, 'pressure-safety-mat')
    expect(canDetect(mat, 'step')).toBe(true)
    expect(canDetect(mat, 'weight')).toBe(true)
    expect(canDetect(mat, 'voiceCommand')).toBe(false)
  })

  it('mmWave レーダーは presence と count を直接検出できる', () => {
    const radar = byId(equipment, 'mmwave-radar-presence')
    expect(directSensedTargets(radar)).toEqual(
      expect.arrayContaining(['presence', 'count']),
    )
  })

  it('検出ソフトとペアで決まる spatial カメラは直接出力を持たない', () => {
    const cam = byId(equipment, 'azure-kinect-dk')
    expect(directSensedTargets(cam)).toEqual([])
    expect(canDetect(cam, 'fullBody')).toBe(false)
  })
})
