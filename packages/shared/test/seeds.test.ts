import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DetectionMethodSeedFileSchema,
  DimensionsSeedFileSchema,
  EquipmentSeedFileSchema,
  InterferenceSeedFileSchema,
} from '../src/index'

function loadJson(relFromRepoRoot: string): unknown {
  const url = new URL(`../../../${relFromRepoRoot}`, import.meta.url)
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
}

describe('seed validation — Zod が data/*.seed.json を受理する', () => {
  it('equipment.seed.json（光学/センサー ハード 16点＋LEDフロア）', () => {
    const parsed = EquipmentSeedFileSchema.parse(loadJson('data/equipment.seed.json'))
    expect(parsed.equipment).toHaveLength(17)
    // LEDフロアは pressure-mat かつ floor-visual 出力を持つ。
    const led = parsed.equipment.find((e) => e.id === 'interactive-led-floor')
    expect(led?.category).toBe('pressure-mat')
    expect(led?.providesFeedback).toContain('floor-visual')
  })

  it('industrial-sensors.seed.json（工業用センサー 9点）', () => {
    const parsed = EquipmentSeedFileSchema.parse(
      loadJson('data/industrial-sensors.seed.json'),
    )
    expect(parsed.equipment).toHaveLength(9)
    // 縦切りの主役: 感圧マットが存在し pressure-mat として型付く。
    const mat = parsed.equipment.find((e) => e.id === 'pressure-safety-mat')
    expect(mat?.category).toBe('pressure-mat')
  })

  it('detection-methods.seed.json（検出ソフト 12点＋OpenCV）', () => {
    const parsed = DetectionMethodSeedFileSchema.parse(
      loadJson('data/detection-methods.seed.json'),
    )
    expect(parsed.detectionMethods).toHaveLength(13)
    const opencv = parsed.detectionMethods.find((d) => d.id === 'opencv-hand-contour')
    expect(opencv?.algorithmFamily).toBe('classical-cv')
    expect(opencv?.robustness).toBe('low')
  })

  it('dimensions.seed.json（判定次元 11点）', () => {
    const parsed = DimensionsSeedFileSchema.parse(loadJson('data/dimensions.seed.json'))
    expect(parsed.dimensions).toHaveLength(11)
    expect(parsed.dimensions.map((d) => d.key)).toContain('area')
  })

  it('interference-rules.seed.json（干渉ルール 7点）', () => {
    const parsed = InterferenceSeedFileSchema.parse(
      loadJson('data/interference-rules.seed.json'),
    )
    expect(parsed.interferenceRules).toHaveLength(7)
  })
})
