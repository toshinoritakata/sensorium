import type { InteractionSpec } from '@feasisense/shared'
import { evaluate, explain } from '@feasisense/engine'
import { loadAllDetectionMethods, loadAllEquipment } from '@feasisense/engine/load-seeds'

/**
 * 入力（構想）→ 出力（機材案）を目で確認するための手回しツール。
 * ここを書き換えて pnpm eval で叩き、精度を詰める。
 */
const equipment = loadAllEquipment()
const detectionMethods = loadAllDetectionMethods()

const scenarios: InteractionSpec[] = [
  {
    id: 'demo-step-floor',
    title: '踏んだら反応する床（標準）',
    context: { area_m2: 12, simultaneousUsers: 4, responsiveness: 'normal', budgetJPY: 800_000 },
    phenomena: [{ id: 'ph-step', sensedTarget: 'step', label: '床を踏む', provenance: 'stated' }],
  },
  {
    id: 'demo-step-tight-budget',
    title: '踏んだら反応する床（予算30万）',
    context: { area_m2: 12, simultaneousUsers: 4, responsiveness: 'normal', budgetJPY: 300_000 },
    phenomena: [{ id: 'ph-step', sensedTarget: 'step', label: '床を踏む', provenance: 'stated' }],
  },
  {
    id: 'demo-step-big',
    title: '踏んだら反応する床（30m²・即応 tight）',
    context: { area_m2: 30, simultaneousUsers: 10, responsiveness: 'tight', budgetJPY: 2_000_000 },
    phenomena: [{ id: 'ph-step', sensedTarget: 'step', label: '床を踏む', provenance: 'stated' }],
  },
  {
    id: 'demo-step-glowing',
    title: '踏むと床が光る（floor-visual 要求あり）',
    context: { area_m2: 12, simultaneousUsers: 4, responsiveness: 'normal', budgetJPY: 3_000_000 },
    phenomena: [{ id: 'ph-step', sensedTarget: 'step', label: '床を踏む', provenance: 'stated' }],
    feedback: [{ id: 'fb-1', kind: 'floor-visual', label: '踏むと床が光る', provenance: 'stated' }],
  },
  {
    id: 'demo-step-zoned',
    title: 'どのタイルを踏んだか局所応答（zoned 弁別）',
    context: { area_m2: 12, simultaneousUsers: 4, responsiveness: 'normal', budgetJPY: 3_000_000 },
    phenomena: [
      {
        id: 'ph-step',
        sensedTarget: 'step',
        label: '床を踏む',
        discrimination: 'zoned',
        provenance: 'stated',
      },
    ],
  },
  {
    id: 'demo-kiosk-hands',
    title: 'キオスクで手を振る（面積なし・hands・即応）',
    context: { simultaneousUsers: 1, responsiveness: 'tight', lighting: 'controlled', budgetJPY: 200_000 },
    phenomena: [{ id: 'ph-hands', sensedTarget: 'hands', label: '手の検出', provenance: 'stated' }],
  },
]

for (const spec of scenarios) {
  console.log('='.repeat(72))
  console.log(explain(spec, evaluate(spec, equipment, detectionMethods)))
  console.log('')
}
