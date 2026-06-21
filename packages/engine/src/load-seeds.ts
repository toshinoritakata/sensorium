import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  DetectionMethodSeedFileSchema,
  EquipmentSeedFileSchema,
  type DetectionMethod,
  type Equipment,
} from '@sensorium/shared'

/**
 * data/ のシードを読み込む（開発/テスト用ローダ）。
 * エンジン本体は純粋（fs 非依存）。この補助だけが I/O を持つ。
 */
const EQUIPMENT_FILES = ['data/equipment.seed.json', 'data/industrial-sensors.seed.json']

function readJson(rel: string): unknown {
  const url = new URL(`../../../${rel}`, import.meta.url)
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
}

export function loadAllEquipment(): Equipment[] {
  return EQUIPMENT_FILES.flatMap(
    (rel) => EquipmentSeedFileSchema.parse(readJson(rel)).equipment,
  )
}

export function loadAllDetectionMethods(): DetectionMethod[] {
  return DetectionMethodSeedFileSchema.parse(readJson('data/detection-methods.seed.json'))
    .detectionMethods
}
