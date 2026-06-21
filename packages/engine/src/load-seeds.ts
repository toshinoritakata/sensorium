import { readFileSync, existsSync } from 'node:fs'
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
const EQUIPMENT_FILES = [
  'data/equipment.seed.json',
  'data/industrial-sensors.seed.json',
  'data/reference.seed.json', // url-extract で取り込んだ定番機材（status:active）。未取込なら無くてよい。
]

function pathFor(rel: string): string {
  return fileURLToPath(new URL(`../../../${rel}`, import.meta.url))
}
function readJson(rel: string): unknown {
  return JSON.parse(readFileSync(pathFor(rel), 'utf8'))
}

export function loadAllEquipment(): Equipment[] {
  return EQUIPMENT_FILES.filter((rel) => existsSync(pathFor(rel))).flatMap(
    (rel) => EquipmentSeedFileSchema.parse(readJson(rel)).equipment,
  )
}

export function loadAllDetectionMethods(): DetectionMethod[] {
  return DetectionMethodSeedFileSchema.parse(readJson('data/detection-methods.seed.json'))
    .detectionMethods
}
