/**
 * [changmen 扩展] PB 采集模式：默认 A8（`mHe` 仅 live）；开 changmen 扩展才双循环 + 赛前写 fo。
 */
let changmenExtensions = false;

export function setPbChangmenExtensions(on: boolean): void {
  changmenExtensions = on === true;
}

export function isPbChangmenExtensions(): boolean {
  return changmenExtensions;
}

/** A8 `mHe`：仅 live 写 fo / refreshOddsOnBets */
export function isPbLiveFoOnly(): boolean {
  return !changmenExtensions;
}

/** changmen 才拉 prematch euro/odds（A8 无此路径） */
export function isPbPrematchCollectEnabled(): boolean {
  return changmenExtensions;
}

/** @deprecated 用 setPbChangmenExtensions；保留以免旧调用方炸 */
export function setPbLiveFoOnly(on: boolean): void {
  changmenExtensions = on !== true;
}
