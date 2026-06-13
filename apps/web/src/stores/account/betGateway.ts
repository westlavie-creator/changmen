import { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import { getProvider } from "@/runtime/providers";
import { bettingDetailHtml, bettingLoadingMessageHtml } from "@/shared/a8Notify";
import type { AccountStoreContext } from "@/stores/account/context";
import { ElNotification } from "element-plus";

export async function checkBetting(_store: AccountStoreContext, account: PlatformAccount | undefined, option: BetOption) {
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
    option.betMoney = account.getBetMoney(option.betMoney, option.odds);
    return await provider.checkBet(account, option);
  } catch (e) {
    option.checkError = e instanceof Error ? e.message : String(e);
    return option;
  }
}

export async function placeBet(
  store: AccountStoreContext,
  account: PlatformAccount | undefined,
  option: BetOption,
  toastSeconds = 10,
) {
  if (!account) return new BetResult(option.type, false, "无可用账号");
  const provider = getProvider(account);
  if (!provider) return new BetResult(option.type, false, "平台不支持");

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

  let result: BetResult = new BetResult(account.provider, false, "未知错误");
  try {
    if (!option.data) {
      option = await checkBetting(store, account, option);
    }
    if (!option.data) {
      result = new BetResult(option.type, false, option.checkError || "预检失败");
    } else {
      result = await provider.betting(account, option);
    }
  } catch (e) {
    result = new BetResult(
      account.provider,
      false,
      e instanceof Error ? e.message : String(e),
      option.data,
    );
  } finally {
    loading.close();
    ElNotification({
      title: accountTitle,
      message: `${detailHtml}<p>${result.message || ""}</p>`,
      type: result.success ? "success" : "error",
      dangerouslyUseHTMLString: true,
      duration: toastSeconds === 0 ? 3000 : toastSeconds * 1000,
    });
  }
  return result;
}
