import type { BetOption } from "@changmen/client-core/models/betOption";
import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { saveUserLog } from "@/api/chat";
import { useAccountStore } from "@/stores/accountStore";

function accountPlatformLabel(account: PlatformAccount): string {
  return useAccountStore().getPlatformName(
    account.platformId,
    account.platformName,
  );
}

/** [A8 可证实] bundle `Ap.saveLog` */
export function saveBetOptionLog(option: BetOption, account: PlatformAccount): void {
  const platformLabel = accountPlatformLabel(account);
  const title = `[${option.type}](${platformLabel},${account.playerName}) 请求盘口数据 => ${!!option.data} / 耗时${Date.now() - option.startTime}ms / ${option.odds}:${option.newOdds || "N/A"}`;
  void saveUserLog(title, {
    options: {
      type: option.type,
      match: option.match?.title,
      matchId: option.matchId,
      bet: option.bet?.getBetName(),
      betId: option.betId,
      target: option.target,
      itemId: option.itemId,
      odds: option.odds,
      newOdds: option.newOdds,
      betMoney: option.betMoney,
      betCount: option.betCount,
      config: option.config,
      loseOrder: option.loseOrder,
    },
    checkError: option.checkError,
    response: option.response,
    request: option.request,
    data: option.data,
  });
}

/** [A8 可证实] bundle `uo.saveLog` */
export function saveBetResultLog(result: BetResult, account: PlatformAccount): void {
  const platformLabel = accountPlatformLabel(account);
  const title = `[${result.provider}](${platformLabel},${account.playerName}) 下注 => ${result.success} / 耗时:${Date.now() - result.beginTime}ms`;
  void saveUserLog(title, { result });
}

