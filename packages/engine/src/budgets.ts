import type { InteractionSpec } from '@feasisense/shared'

/**
 * responsiveness → motion-to-photon 予算[ms]。
 * data/dimensions.seed.json の mappings.responsivenessBudget をミラー。
 * TODO(後続): seed をエンジンに読み込ませ、この定数を単一真実から導出する。
 */
export const RESPONSIVENESS_BUDGET = {
  tight: { comfortMs: 50, tolerableMs: 80, downstreamAllowanceMs: 25 },
  normal: { comfortMs: 80, tolerableMs: 130, downstreamAllowanceMs: 45 },
  relaxed: { comfortMs: 150, tolerableMs: 250, downstreamAllowanceMs: 80 },
} as const

export type ResponsivenessKey = keyof typeof RESPONSIVENESS_BUDGET

/** sensor+detect が使える持ち分（comfort/tolerable から downstream を引いた残り）。 */
export function sensorLatencyAllowance(spec: InteractionSpec): {
  comfortAllowanceMs: number
  tolerableAllowanceMs: number
} {
  const b = RESPONSIVENESS_BUDGET[spec.context.responsiveness]
  return {
    comfortAllowanceMs: b.comfortMs - b.downstreamAllowanceMs,
    tolerableAllowanceMs: b.tolerableMs - b.downstreamAllowanceMs,
  }
}

/** 床敷設センサー（感圧マット/カーテン）のタイル充填効率。カメラ床射影(0.7)より高い。 */
export const FLOOR_PACKING_EFFICIENCY = 0.9
