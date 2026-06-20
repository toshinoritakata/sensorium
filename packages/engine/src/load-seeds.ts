import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EquipmentSeedFileSchema, type Equipment } from '@feasisense/shared'

/**
 * data/ の機材シードを読み込んで結合する（開発/テスト用ローダ）。
 * エンジン本体は純粋（fs 非依存）。この補助だけが I/O を持つ。
 */
const SEED_FILES = ['data/equipment.seed.json', 'data/industrial-sensors.seed.json']

export function loadAllEquipment(): Equipment[] {
  return SEED_FILES.flatMap((rel) => {
    const url = new URL(`../../../${rel}`, import.meta.url)
    const json = JSON.parse(readFileSync(fileURLToPath(url), 'utf8'))
    return EquipmentSeedFileSchema.parse(json).equipment
  })
}
