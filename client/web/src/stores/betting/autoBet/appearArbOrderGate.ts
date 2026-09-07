/**
 * [A8 可证实] 拒单等待是空等，等到点才第一次 `updateOrders`。
 * 等待期内拉单会提前消耗平博 SQ 拒单缓存；RAY/OB 也会比 A8 更早定案。
 */
export function canAppearArbOrderDuringRejectWait(_provider?: string): boolean {
  return false;
}
