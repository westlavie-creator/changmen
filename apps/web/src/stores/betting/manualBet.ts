import { ElMessageBox } from "element-plus";
import { BetOption } from "@/models/betOption";
import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";
import { useOrderStore } from "@/stores/orderStore";
import { accountPassesMainBetFilter } from "@/stores/betting/betFilters";
import { markSuccessfulBet } from "@/stores/betting/betSession";
import { betToastSeconds } from "@/shared/bettingSession";

export interface ManualBetContext {
  setMessage: (msg: string) => void;
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
  const orderStore = useOrderStore();
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const { setMessage } = ctx;

  // 先 getAccount(type, 0)，无账号再提示；有账号才 prompt 金额
  const account = accountStore.getAccount(item.type, 0);
  if (!account) {
    await ElMessageBox.alert("没有找到对应的账号", String(item.type));
    return;
  }

  let amount: number;
  try {
    const { value } = await ElMessageBox.prompt("请输入要投注的金额", "手动下单", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      inputValue: String(configStore.config.betMoney || 10),
      inputType: "number",
      inputValidator: (val) => (Number(val) > 0 ? true : "请输入有效金额"),
    });
    amount = Number(value);
    if (!amount || amount <= 0) return;
  } catch {
    return;
  }

  const odds = item.getOdds(side);
  let option = new BetOption(match, bet, item, side, amount);
  option.odds = odds;
  if (!accountPassesMainBetFilter(account, bet, match, option, matchStore)) {
    await ElMessageBox.alert(`当前 ${item.type} 账号不满足投注条件`, "提示");
    return;
  }
  const bal = account.getBalance();
  if (bal !== undefined && bal < amount) {
    await ElMessageBox.alert(`余额不足（${bal} < ${amount}）`, String(item.type));
    return;
  }
  const toastSec = betToastSeconds(configStore.config, account.provider);
  option = await accountStore.checkBetting(account, option);
  if (!option.data) {
    ElMessageBox.alert(option.checkError || "前置检查失败", "前置检查失败");
    return;
  }
  const result = await accountStore.betting(account, option, toastSec);
  if (result?.success) {
    markSuccessfulBet(account, bet.id, side, option.odds, match.game);
    setMessage(`手动下单成功 ${item.type}@${option.odds}`);
    void accountStore.refreshBalance(account);
    void orderStore.fetchOrders();
  } else {
    ElMessageBox.alert(result?.message || "下单失败", "下单失败");
  }
}
