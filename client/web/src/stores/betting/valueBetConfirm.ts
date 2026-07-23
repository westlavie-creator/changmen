import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { ElMessageBox } from "element-plus";
import { accountPassesMainBetFilter } from "@/domain/betting/betFilters";
import { isSingleLegRateAtOdds } from "@/domain/betting/singleLegRate";
import {
  computeValueBetEdge,
  isValueBetPositiveEdge,
} from "@/extensions/valueBet/computeValueBetEdge";
import { readValueBetMoney } from "@/extensions/valueBet/valueBetStake";
import { BetOption } from "@changmen/client-core/models/betOption";
import { createValueBetLinkId, toFixed } from "@changmen/client-core/shared/format";
import { manualBetToastSeconds } from "@/shared/betTiming";
import { wait } from "@changmen/client-core/shared/wait";
import { useAccountStore } from "@/stores/accountStore";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";
import {
  buildManualBetCheckFailureHtml,
  buildManualBetContextLines,
  buildManualBetOrderFailureHtml,
} from "@/stores/betting/manualBetAlert";
import {
  bindArbLegOrder,
  refreshOrderListAfterBind,
} from "@/stores/betting/arbOrderBind";
import { markSuccessfulBet } from "@/stores/betting/successMarkers";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useUserStore } from "@/stores/userStore";

export interface ValueBetConfirmContext {
  setMessage: (msg: string) => void;
}

export function buildValueBetConfirmPromptMessage(
  match: ViewMatch,
  bet: ViewBet,
  item: ViewBetItem,
  side: BetSide,
  snap: { softOdds: number; fairOdds: number; edge: number },
): string {
  const team = side === "Home" ? bet.homeName : bet.awayName;
  return [
    ...buildManualBetContextLines(match, bet, item, side, snap.softOdds),
    `公允(PB)：${toFixed(snap.fairOdds, 3)}`,
    `Edge：+${(snap.edge * 100).toFixed(1)}% · ${team}`,
    "",
    "确认后按下方金额单边下单（非套利）。可修改金额。",
  ].join("\n");
}

export function explainValueBetBlocked(betId: number): string | null {
  const lose = useLoseOrderStore();
  if (lose.orders.has(betId))
    return "该盘口在补单队列中，请先处理补单";
  const active = useActiveBetRunStore();
  if (active.runs.has(betId))
    return "该盘口套利/补单进行中，请稍后再试";
  return null;
}

/**
 * [changmen 扩展] 正 EV 半自动确认下单（P1）。
 * 入口：点击金色 edge 角标；不改双击手动下单；不进套利 linkId/makeup。
 */
export async function runValueBetConfirm(
  match: ViewMatch,
  bet: ViewBet,
  item: ViewBetItem,
  side: BetSide,
  ctx: ValueBetConfirmContext,
): Promise<void> {
  const user = useUserStore();
  if (user.config.valueBetConfirm === false) {
    await ElMessageBox.alert("已关闭「正EV确认下单」，请在参数配置中开启", "正 EV");
    return;
  }

  const blocked = explainValueBetBlocked(bet.id);
  if (blocked) {
    await ElMessageBox.alert(blocked, "正 EV");
    return;
  }

  const snap = computeValueBetEdge(bet, item, side);
  if (!snap || !isValueBetPositiveEdge(snap.edge)) {
    await ElMessageBox.alert("正 EV 已消失或不足 3%，请刷新后再试", "正 EV");
    return;
  }

  const accountStore = useAccountStore();
  const matchStore = useMatchStore();
  const { setMessage } = ctx;

  const account = accountStore.getAccount(item.type, 0);
  if (!account) {
    await ElMessageBox.alert("没有找到对应的账号", String(item.type));
    return;
  }

  const defaultAmount = readValueBetMoney(user.config);
  if (defaultAmount <= 0) {
    await ElMessageBox.alert("请先在参数配置中设置「正EV金额」", "正 EV");
    return;
  }

  let amount: number;
  try {
    const { value } = await ElMessageBox.prompt(
      buildValueBetConfirmPromptMessage(match, bet, item, side, snap),
      "正 EV 下单",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        inputValue: String(defaultAmount),
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

  // 确认后再次校验 edge / 互斥，避免弹窗期间盘口变化
  const blocked2 = explainValueBetBlocked(bet.id);
  if (blocked2) {
    await ElMessageBox.alert(blocked2, "正 EV");
    return;
  }
  const snap2 = computeValueBetEdge(bet, item, side);
  if (!snap2 || !isValueBetPositiveEdge(snap2.edge)) {
    await ElMessageBox.alert("确认期间正 EV 已消失，已取消下单", "正 EV");
    return;
  }

  let option = new BetOption(match, bet, item, side, amount);
  option.odds = snap2.softOdds;
  if (isSingleLegRateAtOdds(account, snap2.softOdds)) {
    await ElMessageBox.alert(
      "该账号在此赔率区间为比例 9999 单边模式，请改比例或换账号后再试",
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
      buildManualBetCheckFailureHtml(
        match,
        bet,
        item,
        side,
        snap2.softOdds,
        amount,
        option.checkError,
      ),
      `${item.type} 预检未通过`,
      {
        dangerouslyUseHTMLString: true,
        customClass: "manual-bet-result-box",
        confirmButtonText: "知道了",
      },
    );
    return;
  }

  const linkId = createValueBetLinkId();
  const result = await accountStore.betting(account, option, toastSec);
  if (result?.success) {
    markSuccessfulBet(account, bet.id, side, option.odds);
    // 方案 B：先 saveOrders 入库，再绑 💎 Link（多数场馆 BetResult 无 orderId）
    let bound = false;
    try {
      await wait(result.orderId ? 400 : 1500);
      const orders = (await accountStore.updateVenueOrders(account)) ?? [];
      bound = await bindArbLegOrder(linkId, account, result, orders, false);
      if (bound)
        refreshOrderListAfterBind();
    }
    catch {
      bound = false;
    }
    setMessage(
      bound
        ? `正EV下单成功 ${item.type}@${option.odds} +${(snap2.edge * 100).toFixed(1)}%`
        : `正EV下单成功 ${item.type}@${option.odds}（💎 标记稍后刷新）`,
    );
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
