import { z } from 'zod'

/**
 * 撮像/入力モダリティ。検出は「どのストリームを使う経路か」で性質が変わる。
 * 同じ深度カメラでも rgb / ir / depth を出し、検出ソフトはそのどれかを消費する。
 * 経路のモダリティは lighting 次元と連動する（RGB は要光、IR/深度は暗所可）。
 */
export const InputModality = z.enum(['rgb', 'ir', 'depth', 'pointcloud', 'audio'])
export type InputModality = z.infer<typeof InputModality>
