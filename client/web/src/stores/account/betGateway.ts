import type { BetOption } from "@changmen/client-core/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { AccountStoreContext } from "@/stores/account/context";
import { ElNotification } from "element-plus";
import { BetResult } from "@changmen/client-core/models/betResult";
import { publishBettingEvent } from "@/realtime/publishBetting";
import { getProvider } from "@/runtime/providers";
import {
  bettingDetailHtml,
  bettingLoadingMessageHtml,
  bettingNotifyAccountLine,
  bettingResultMessageHtml,
} from "@/shared/a8Notify";
import { playOrderSuccessSound } from "@/shared/orderSound";
import { settleArbLeg } from "@/stores/betting/autoBet/arbLegSettle";
import { attachPolymarketDetectionQuote } from "@/domain/polymarket/attachDetectionQuote";
import { attachPredictFunDetectionQuote } from "@/domain/predictfun/attachDetectionQuote";
import { resolveVenueStakeFromPlanCny, type ResolveVenueStakeOpts } from "@changmen/venue-adapter/adaptation";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

export type CheckBettingOpts = ResolveVenueStakeOpts;

/** [changmen 扩展] 将扩展页 PM卖单开关写入 option（默认关，仅 true 开启） */
function attachPolymarketAutoExitSellPref(option: BetOption): void {
  if (option.type !== "Polymarket")
    return;
  option.pmAutoExitSell = useUserStore().extensionPrefs.pmAutoExitSell === true;
}

function notifyPendingVenueConfirm(
  store: AccountStoreContext,
  account: PlatformAccount,
  accountLine: string,
  detailHtml: string,
  result: BetResult,
  option: BetOption,
  toastSeconds: number,
) {
  void (async () => {
    const { rejected, pendingConfirm } = await settleArbLeg(account, result, 0);
    // PM：保持原语义（timeout 仍显示「已成交」）；PF：区分待确认
    const isPf = account.provider === "PredictFun";
    const stillPending = isPf && pendingConfirm;
    const titleSuffix = stillPending
      ? "待确认"
      : rejected
        ? "未成交"
        : "已成交";
    ElNotification({
      title: "",
      message: bettingResultMessageHtml(
        account.provider,
        accountLine,
        detailHtml,
        `<p>${result.message || ""}</p>`,
        titleSuffix,
      ),
      type: stillPending ? "warning" : rejected ? "error" : "success",
      dangerouslyUseHTMLString: true,
      duration: toastSeconds === 0 ? 3000 : toastSeconds * 1000,
      customClass: `notification ${account.provider}`,
    });
    if (!rejected && !stillPending) {
      void playOrderSuccessSound({ betRowId: option.betId });
      void publishBettingEvent(option);
    }
    if (isPf) {
      try {
        const { refreshAccountBalance } = await import("@/stores/account/balanceRefresh");
        await refreshAccountBalance(store, account);
      }
      catch {
        /* 刷新失败不阻断 toast */
      }
    }
  })();
}

export async function checkBetting(
  _store: AccountStoreContext,
  account: PlatformAccount | undefined,
  option: BetOption,
  opts?: CheckBettingOpts,
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
    attachPredictFunDetectionQuote(option);
    attachPolymarketAutoExitSellPref(option);
    // [A8 适配] 编排 Plan CNY → 场馆原币（CNY / U / PM）；预检后不改，跌价由各场馆 checkBet 拒单
    option.betMoney = resolveVenueStakeFromPlanCny(account, option.betMoney, option.odds, opts);
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
  const accountLine = bettingNotifyAccountLine(account, platformLabel);
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
    title: "",
    message: bettingLoadingMessageHtml(account.provider, accountLine, detailHtml),
    dangerouslyUseHTMLString: true,
    duration: 10_000,
    customClass: `notification loading ${account.provider}`,
  });

  const beginTime = Date.now();
  let result: BetResult = new BetResult(account.provider, false, "未知错误");
  try {
    attachPolymarketAutoExitSellPref(option);
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
    const statusSuffix = result.pending ? "待确认" : "";
    ElNotification({
      title: "",
      message: bettingResultMessageHtml(
        account.provider,
        accountLine,
        detailHtml,
        `<p>${result.message || ""}</p>`,
        statusSuffix,
      ),
      type: notifyType,
      dangerouslyUseHTMLString: true,
      customClass: `notification ${account.provider}`,
      duration: toastSeconds === 0 ? 3000 : toastSeconds * 1000,
    });
    useMessageStore().delayMessage(account, Date.now() - beginTime);
    result.saveLog(account, beginTime);
    if (result.success && !result.pending) {
      void playOrderSuccessSound({ betRowId: option.betId });
      void publishBettingEvent(option);
    }
    if (
      result.pending
      && !option.loseOrder
      && (
        (account.provider === "Polymarket" && !option.deferPmSettlement)
        || account.provider === "PredictFun"
      )
    ) {
      notifyPendingVenueConfirm(
        store,
        account,
        accountLine,
        detailHtml,
        result,
        option,
        toastSeconds,
      );
    }
  }
  return result;
}
