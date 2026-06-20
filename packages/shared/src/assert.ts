/**
 * 網羅性チェック。閉じた union を switch/分岐で捌くとき、最後の到達不能枝に置く。
 * ケースを取りこぼすと `x` が `never` に収束しないため**コンパイルエラー**になる
 * （Haskell の網羅的パターンマッチに相当）。実行時に到達したら投げる。
 */
export function assertNever(x: never, context = 'value'): never {
  throw new Error(`未処理の ${context}: ${JSON.stringify(x)}`)
}
