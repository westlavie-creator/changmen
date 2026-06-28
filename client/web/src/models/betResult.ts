import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import { saveBetResultLog } from "@/services/bettingLog";

/** 对齐 A8 bundle `uo` */
export class BetResult {
  provider: PlatformId;
  success: boolean;
  message: string | null | undefined;
  tip: unknown = null;
  reject: unknown = null;
  orderId: string | null = null;
  link = 0;
  beginTime: number;
  request?: unknown;
  response?: unknown;

  constructor(
    provider: PlatformId,
    success: boolean,
    message?: string | null,
    request?: unknown,
    response?: unknown,
  ) {
    this.provider = provider;
    this.success = success;
    this.message = message;
    this.beginTime = Date.now();
    this.request = request;
    this.response = response;
  }

  /** [A8 可证实] bundle `uo.saveLog` */
  saveLog(account: PlatformAccount, beginTime?: number) {
    if (beginTime !== undefined)
      this.beginTime = beginTime;
    saveBetResultLog(this, account);
  }
}

export interface OrderBindRow {
  LinkID: number;
  Provider: PlatformId;
  OrderID: string;
  /** 可选；服务端 bind 也可用 Provider 匹配 */
  PlayerID?: number;
}
