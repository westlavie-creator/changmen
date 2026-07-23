import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { ElMessageBox } from "element-plus";
import { accountPassesMainBetFilter } from "@/domain/betting/betFilters";
import { isSingleLegRateAtOdds } from "@/domain/betting/singleLegRate";
import { BetOption } from "@changmen/client-core/models/betOption";
import { wait } from "@changmen/client-core/shared/wait";
import { manualBetToastSeconds } from "@/shared/betTiming";
import { useAccountStore } from "@/stores/accountStore";
import {
  buildManualBetCheckFailureHtml,
  buildManualBetContextLines,
  buildManualBetOrderFailureHtml,
} from "@/stores/betting/manualBetAlert";
import { refreshOrderListAfterBind } from "@/stores/betting/arbOrderBind";
import { markSuccessfulBet } from "@/stores/betting/successMarkers";
import { useUserStore } from "@/stores/userStore";
import { useMatchStore } from "@/stores/matchStore";

export interface ManualBetContext {
  setMessage: (msg: string) => void;
}

/** 手动下单 prompt 正文：展示赛事、盘口、平台与所选边 */
export function buildManualBetPromptMessage(
  match: ViewMatch,
  bet: ViewBet,
  item: ViewBetItem,
  side: BetSide,
  odds: number,
): string {
  return [
    ...buildManualBetContextLines(match, bet, item, side, odds),
    "",
    "请输入要买入的金额",
  ].join("\n");
}

/** [A8 可证实] 双击赔率手动下单 */
export async function runManualBet(
  match: ViewMatch,
  bet: ViewBet,
  item: ViewBetItem,
  side: BetSide,
  ctx: ManualBetContext,
): Promise<void> {
  const accountStore = useAccountStore();
  const user = useUserStore();
  const matchStore = useMatchStore();
  const { setMessage } = ctx;

  // 先 getAccount(type, 0)，无账号再提示；有账号才 prompt 金额
  const account = accountStore.getAccount(item.type, 0);
  if (!account) {
    await ElMessageBox.alert("没有找到对应的账号", String(item.type));
    return;
  }

  const odds = item.getOdds(side);
  let amount: number;
  try {
    const { value } = await ElMessageBox.prompt(
      buildManualBetPromptMessage(match, bet, item, side, odds),
      "手动下单",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        inputValue: String(user.config.betMoney || 10),
        inputType: "number",
        inputValidator: val => (Number(val) > 0 ? true : "请输入有效金额"),
        customClass: "manual-bet-prompt-box",
      },
    );
    amount = Number(value);
    if (!amount || amount <= 0)
      return;
  }
  catch {
    return;
  }

  let option = new BetOption(match, bet, item, side, amount);
  option.odds = odds;
  if (isSingleLegRateAtOdds(account, odds)) {
    await ElMessageBox.alert(
      "该账号在此赔率区间为比例 9999 单边模式，本侧请用手动在其他平台对冲，或改比例后重试",
      "提示",
    );
    return;
  }
  if (!accountPassesMainBetFilter(account, bet, match, option, matchStore)) {
    await ElMessageBox.alert(`当前 ${item.type} 账号不满足买入条件`, "提示");
    return;
  }
  const bal = account.getBalance();
  if (bal !== undefined && bal < amount) {
    await ElMessageBox.alert(`余额不足（${bal} < ${amount}）`, String(item.type));
    return;
  }
  const toastSec = manualBetToastSeconds();
  option = await accountStore.checkBetting(account, option);
  if (!option.data) {
    await ElMessageBox.alert(
      buildManualBetCheckFailureHtml(match, bet, item, side, odds, amount, option.checkError),
      `${item.type} 预检未通过`,
      {
        dangerouslyUseHTMLString: true,
        customClass: "manual-bet-result-box",
        confirmButtonText: "知道了",
      },
    );
    return;
  }
  const result = await accountStore.betting(account, option, toastSec);
  if (result?.success) {
    markSuccessfulBet(account, bet.id, side, option.odds);
    setMessage(`手动下单成功 ${item.type}@${option.odds}`);
    // [changmen 扩展] 对齐正 EV：立刻 sync 入库并刷侧栏，避免干等 Io.f 2–3 分钟
    try {
      await wait(result.orderId ? 400 : 1500);
      await accountStore.updateVenueOrders(account);
      refreshOrderListAfterBind();
    }
    catch {
      // updateVenueOrders 已吞错；此处仅兜底 wait/刷新异常，不影响成功提示
    }
    // delayed：由 notifyPendingVenueConfirm 在 settle 确认后刷，避免早刷盖回旧余额
    if (!result.pending)
      void accountStore.refreshBalance(account);
  }
  else {
    const message = result?.message || "下单失败";
    if (item.type === "Polymarket") {
      ElMessageBox.alert(buildManualBetOrderFailureHtml(message), "下单失败", {
        dangerouslyUseHTMLString: true,
        customClass: "manual-bet-result-box",
        confirmButtonText: "知道了",
      });
    }
    else {
      ElMessageBox.alert(message, "下单失败");
    }
  }
}
