import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { AccountStoreContext } from "@/stores/account/context";
import { ElNotification } from "element-plus";
import { BetResult } from "@/models/betResult";
import { publishBettingEvent } from "@/realtime/publishBetting";
import { getProvider } from "@/runtime/providers";
import { bettingDetailHtml, bettingLoadingMessageHtml } from "@/shared/a8Notify";
import { playOrderSuccessSound } from "@/shared/orderSound";
import { rejectWaitSeconds, waitRejectDetection } from "@/stores/betting/autoBet/rejectWait";
import { syncVenueOrdersWithRejectForLeg } from "@/stores/betting/autoBet/venueRejectSync";
import { attachPolymarketDetectionQuote } from "@/domain/polymarket/attachDetectionQuote";
import { useConfigStore } from "@/stores/configStore";
import { useMessageStore } from "@/stores/messageStore";

function notifyPolymarketAfterRejectDetection(
  account: PlatformAccount,
  accountTitle: string,
  detailHtml: string,
  result: BetResult,
  option: BetOption,
  toastSeconds: number,
) {
  void (async () => {
    const rejectWait = rejectWaitSeconds(useConfigStore().config, [account]);
    await waitRejectDetection(rejectWait, rejectWait);
    const { rejected } = await syncVenueOrdersWithRejectForLeg(account, result);
    const titleSuffix = rejected ? "未成交" : "已成交";
    ElNotification({
      title: `${accountTitle} ${titleSuffix}`,
      message: `${detailHtml}<p>${result.message || ""}</p>`,
      type: rejected ? "error" : "success",
      dangerouslyUseHTMLString: true,
      duration: toastSeconds === 0 ? 3000 : toastSeconds * 1000,
    });
    if (!rejected) {
      void playOrderSuccessSound({ betRowId: option.betId });
      void publishBettingEvent(option);
    }
  })();
}

export async function checkBetting(
  _store: AccountStoreContext,
  account: PlatformAccount | undefined,
  option: BetOption,
) {
  if (!account) {
    option.checkError = `场馆${option.type}没有可用账号`;
    return option;
  }
  const provider = getProvider(account);
  if (!provider) {
    option.checkError = `场馆${option.type}不被支持`;
    return option;
  }
  try {
    attachPolymarketDetectionQuote(option);
    option.betMoney = account.getBetMoney(option.betMoney, option.odds);
    return await provider.checkBet(account, option);
  }
  catch (e) {
    option.checkError = e instanceof Error ? e.message : JSON.stringify(e);
    return option;
  }
  finally {
    option.saveLog(account);
  }
}

export async function placeBet(
  store: AccountStoreContext,
  account: PlatformAccount | undefined,
  option: BetOption,
  toastSeconds = 10,
) {
  if (!account)
    return new BetResult(option.type, false, "无可用账号");
  const provider = getProvider(account);
  if (!provider)
    return new BetResult(option.type, false, "平台不支持");

  const platformLabel = store.getPlatformName(account.platformId, account.platformName);
  const accountTitle = `${account.provider} / ${platformLabel} / ${account.playerName}`;
  const detailHtml = bettingDetailHtml({
    matchTitle: option.match?.title,
    betName: option.bet?.getBetName(),
    target: option.target,
    itemOdds: option.item?.getOdds(option.target),
    betMoney: option.betMoney,
    odds: option.odds,
    betCount: option.betCount,
  });

  const loading = ElNotification({
    title: `${accountTitle} 投注中...`,
    message: bettingLoadingMessageHtml(account.provider, detailHtml),
    dangerouslyUseHTMLString: true,
    duration: 10_000,
    customClass: `notification loading ${account.provider}`,
  });

  const beginTime = Date.now();
  let result: BetResult = new BetResult(account.provider, false, "未知错误");
  try {
    if (!option.data) {
      option = await checkBetting(store, account, option);
    }
    if (!option.data) {
      result = new BetResult(option.type, false, option.checkError || "预检失败");
    }
    else {
      result = await provider.betting(account, option);
    }
  }
  catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const message = raw.includes("Failed to fetch dynamically imported module")
      ? "页面资源已过期（服务端刚发版），请刷新页面后重试"
      : raw;
    result = new BetResult(
      account.provider,
      false,
      message,
      option.data,
    );
  }
  finally {
    loading.close();
    const notifyType = result.pending ? "warning" : result.success ? "success" : "error";
    const notifyTitle = result.pending ? `${accountTitle} 待确认` : accountTitle;
    ElNotification({
      title: notifyTitle,
      message: `${detailHtml}<p>${result.message || ""}</p>`,
      type: notifyType,
      dangerouslyUseHTMLString: true,
      duration: toastSeconds === 0 ? 3000 : toastSeconds * 1000,
    });
    useMessageStore().delayMessage(account, Date.now() - beginTime);
    result.saveLog(account, beginTime);
    if (result.success && !result.pending) {
      void playOrderSuccessSound({ betRowId: option.betId });
      void publishBettingEvent(option);
    }
    if (result.pending && account.provider === "Polymarket") {
      notifyPolymarketAfterRejectDetection(
        account,
        accountTitle,
        detailHtml,
        result,
        option,
        toastSeconds,
      );
    }
  }
  return result;
}
