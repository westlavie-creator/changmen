import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import { saveUserLog } from "@/api/chat";
import { useAccountStore } from "@/stores/accountStore";

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
    const accountStore = useAccountStore();
    const platformLabel = accountStore.getPlatformName(
      account.platformId,
      account.platformName,
    );
    const title = `[${this.provider}](${platformLabel},${account.playerName}) 下注 => ${this.success} / 耗时:${Date.now() - this.beginTime}ms`;
    void saveUserLog(title, { result: this });
  }
}

export interface OrderBindRow {
  LinkID: number;
  Provider: PlatformId;
  OrderID: string;
  /** 可选；服务端 bind 也可用 Provider 匹配 */
  PlayerID?: number;
}
