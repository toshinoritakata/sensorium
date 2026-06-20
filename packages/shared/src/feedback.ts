import { z } from 'zod'

/**
 * フィードバック（出力）軸。検出だけでなく「体験がどう応答するか」を表す。
 * 当初スコープ外だった出力を、最小限だけ第一級にする（論点E 後の拡張）。
 * - floor-visual: 床面そのものが光る/映像を出す（インタラクティブLEDフロア等）
 * - surface-visual: 壁/什器など床以外の面ディスプレイ
 * - sound: 音の応答
 * - light: 照明・スポット等の点灯制御
 */
export const FeedbackKind = z.enum(['floor-visual', 'surface-visual', 'sound', 'light'])
export type FeedbackKind = z.infer<typeof FeedbackKind>
