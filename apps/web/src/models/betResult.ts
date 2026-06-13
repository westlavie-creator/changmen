import type { PlatformId } from "@/types/esport";

/** 对齐 A8 bundle `uo` */
export class BetResult {
  provider: PlatformId;
  success: boolean;
  message: string;
  orderId: string | null = null;
  beginTime: number;
  request?: unknown;
  response?: unknown;

  constructor(
    provider: PlatformId,
    success: boolean,
    message: string,
    request?: unknown,
    response?: unknown,
  ) {
    this.provider = provider;
    this.success = success;
    this.message = message || (success ? "下单成功" : "下单失败");
    this.beginTime = Date.now();
    this.request = request;
    this.response = response;
  }
}

export interface OrderBindRow {
  LinkID: number;
  Provider: PlatformId;
  OrderID: string;
  /** 可选；服务端 bind 也可用 Provider 匹配 */
  PlayerID?: number;
}

/** [changmen 扩展] 仅比例 9999 导致单边下注时用负数 link，展示为 gb{时间戳}；其余对齐 A8 `Date.now()` */
export function createBetLinkId(rate9999SingleLeg = false) {
  const ts = Date.now();
  return rate9999SingleLeg ? -ts : ts;
}
