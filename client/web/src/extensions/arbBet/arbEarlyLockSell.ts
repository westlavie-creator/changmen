/**
 * [changmen 扩展] 庄+PM/PF 提前锁利。
 *
 * 扫描未结套利 Link：若卖掉预测市场腿后「判定净利」仍高于锁定利润 + minExtra，则市价卖出。
 * - pmEdge：PM/PF 浮盈（可卖回款 − 成本）≥ 锁定利润 + minExtra（卖后保留庄家单边）
 * - floor：最差结果（卖出回款 − 组本金）≥ 锁定利润 + minExtra（二元盘极少触发）
 *
 * 挂在 mainBetLoop 末尾，节流；默认关闭，不挡 A8 主路径。
 */
import type { ArbEarlyLockSellPrefs } from "@/types/extensionPrefs";
import type { OrderRow } from "@/types/order";
import type { PlatformAccount } from "@/models/platformAccount";
import { Currency, getExchange } from "@changmen/shared/currency";
import {
  estimatePolymarketManualSellProceedsUsdc,
  sellPolymarketBuyPosition,
  type OrderRowLike,
} from "@changmen/venue-adapter/polymarket";
import { pfSubmitSell } from "@changmen/venue-adapter/predictfun";
import { saveOrders } from "@/api/order";
import { a8Tip } from "@/shared/a8Notify";
import {
  estimateArbLockedProfitCny,
  isLinkedArbOrderGroup,
  isMakeupSyntheticOrderRow,
} from "@/shared/orderLink";
import { canManualSellPfBuy } from "@/stores/account/pfManualSell";
import { canManualSellPmBuy } from "@/stores/account/pmManualSell";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useOrderStore } from "@/stores/orderStore";
import { useUserStore } from "@/stores/userStore";

export const ARB_EARLY_LOCK_SCAN_MS = 5_000;
export const ARB_EARLY_LOCK_COOLDOWN_MS = 60_000;

export interface ArbEarlyLockDecisionInput {
  enabled: boolean;
  mode: "pmEdge" | "floor";
  minExtraProfit: number;
  lockedProfitCny: number;
  /** 可卖回款（CNY） */
  sellProceedsCny: number;
  /** 预测市场腿成本（CNY） */
  pmCostCny: number;
  /** 套利组总本金（CNY）= 庄 + PM */
  totalCostCny: number;
}

const sellingIds = new Set<string>();
const cooldownUntil = new Map<string, number>();
let lastScanAt = 0;
let scanInFlight = false;

export function isArbEarlyLockSellEnabled(
  prefs: ArbEarlyLockSellPrefs | undefined | null,
): boolean {
  return prefs?.enabled === true;
}

/** 纯判定：是否应提前卖掉预测市场腿 */
export function decideArbEarlyLockSell(
  input: ArbEarlyLockDecisionInput,
): boolean {
  if (!input.enabled)
    return false;
  if (!(Number.isFinite(input.lockedProfitCny)))
    return false;
  if (!(input.sellProceedsCny > 0) || !(input.pmCostCny > 0))
    return false;
  const minExtra = Number.isFinite(input.minExtraProfit) ? input.minExtraProfit : 0;
  const threshold = input.lockedProfitCny + minExtra;
  if (input.mode === "floor") {
    const worst = input.sellProceedsCny - input.totalCostCny;
    return worst >= threshold;
  }
  const pmEdge = input.sellProceedsCny - input.pmCostCny;
  return pmEdge >= threshold;
}

function readPrefs(
  prefs?: ArbEarlyLockSellPrefs | null,
): ArbEarlyLockSellPrefs | undefined {
  if (prefs)
    return prefs;
  try {
    return useUserStore().extensionPrefs?.arbEarlyLockSell;
  }
  catch {
    return undefined;
  }
}

function usdtToCny(usdt: number): number {
  return usdt * getExchange(Currency.USDT);
}

function pmCostCny(row: OrderRow): number {
  const usdc = Number(row.PmStakeUsdc) || 0;
  if (usdc > 0)
    return usdtToCny(usdc);
  return Number(row.BetMoney) || 0;
}

function pfCostCny(row: OrderRow): number {
  const notional = Number(row.PfNotionalUsdt);
  if (Number.isFinite(notional) && notional > 0)
    return usdtToCny(notional);
  return usdtToCny(Number(row.BetMoney) || 0);
}

function bookCostCny(row: OrderRow): number {
  return Number(row.BetMoney) || 0;
}

async function estimatePmSellProceedsUsdc(
  account: PlatformAccount,
  row: OrderRow,
): Promise<number> {
  return estimatePolymarketManualSellProceedsUsdc({
    account,
    buyRow: row as OrderRowLike,
  });
}

/** PF：用 oddsStore 隐含价粗估（无深度）；失败返回 0 */
function estimatePfSellProceedsUsdt(row: OrderRow): number {
  const shares = Number(row.PfHoldShares) > 0
    ? Number(row.PfHoldShares)
    : Number(row.PfShares) || 0;
  if (!(shares > 0))
    return 0;
  const tokenId = String(row.PfTokenId ?? "").trim();
  if (!tokenId)
    return 0;
  try {
    const odds = useOddsStore().getOdds("PredictFun" as never, tokenId, 0);
    if (!(odds > 1))
      return 0;
    const price = 1 / odds;
    if (!(price > 0 && price < 1))
      return 0;
    // 无 bid 深度：打 2% 折保守估
    return Math.round(shares * price * 0.98 * 10000) / 10000;
  }
  catch {
    return 0;
  }
}

function notify(title: string, message: string): void {
  try {
    a8Tip(title, message, 4000);
  }
  catch { /* ignore */ }
}

async function sellPm(account: PlatformAccount, row: OrderRow): Promise<boolean> {
  const orderId = String(row.OrderID ?? "").trim();
  if (!orderId || sellingIds.has(orderId))
    return false;
  sellingIds.add(orderId);
  try {
    const result = await sellPolymarketBuyPosition({
      account,
      buyRow: row as OrderRowLike,
    });
    if (!result.ok)
      return false;
    if (result.ordersToSave?.length)
      await saveOrders(account, result.ordersToSave);
    return true;
  }
  catch {
    return false;
  }
  finally {
    sellingIds.delete(orderId);
  }
}

async function sellPf(account: PlatformAccount, row: OrderRow): Promise<boolean> {
  const orderId = String(row.OrderID ?? "").trim();
  if (!orderId || sellingIds.has(orderId))
    return false;
  sellingIds.add(orderId);
  try {
    await pfSubmitSell(account, orderId);
    return true;
  }
  catch {
    return false;
  }
  finally {
    sellingIds.delete(orderId);
  }
}

function linkHasPendingMakeup(linkId: number): boolean {
  try {
    const lose = useLoseOrderStore();
    for (const order of lose.orders.values()) {
      if (Number(order.linkId) === linkId)
        return true;
    }
  }
  catch { /* ignore */ }
  return false;
}

function isOpenBookLeg(row: OrderRow): boolean {
  if (isMakeupSyntheticOrderRow(row))
    return false;
  const t = String(row.Type ?? "").trim();
  if (t === "Polymarket" || t === "PredictFun")
    return false;
  return String(row.Status ?? "") === "None";
}

interface EarlyLockTarget {
  linkId: number;
  pred: OrderRow;
  kind: "Polymarket" | "PredictFun";
  lockedProfitCny: number;
  rows: OrderRow[];
}

function collectTargets(orders: Map<number, OrderRow[]>): EarlyLockTarget[] {
  const out: EarlyLockTarget[] = [];
  for (const [linkId, rows] of orders) {
    if (!(Number.isFinite(linkId) && linkId !== 0))
      continue;
    if (!isLinkedArbOrderGroup(rows))
      continue;
    if (linkHasPendingMakeup(linkId))
      continue;
    const bookOk = rows.some(isOpenBookLeg);
    if (!bookOk)
      continue;
    const locked = estimateArbLockedProfitCny(rows);
    if (locked == null || !Number.isFinite(locked))
      continue;
    const pm = rows.find(r => canManualSellPmBuy(r));
    if (pm) {
      out.push({
        linkId,
        pred: pm,
        kind: "Polymarket",
        lockedProfitCny: locked,
        rows,
      });
      continue;
    }
    const pf = rows.find(r => canManualSellPfBuy(r));
    if (pf) {
      out.push({
        linkId,
        pred: pf,
        kind: "PredictFun",
        lockedProfitCny: locked,
        rows,
      });
    }
  }
  return out;
}

/**
 * 主循环钩子：节流扫描；失败不影响调用方。
 * @returns 本轮实际卖出笔数
 */
export async function runArbEarlyLockSellTick(opts?: {
  prefs?: ArbEarlyLockSellPrefs | null;
  now?: number;
  force?: boolean;
}): Promise<number> {
  if (scanInFlight)
    return 0;
  const prefs = readPrefs(opts?.prefs);
  if (!isArbEarlyLockSellEnabled(prefs))
    return 0;
  const now = opts?.now ?? Date.now();
  if (!opts?.force && now - lastScanAt < ARB_EARLY_LOCK_SCAN_MS)
    return 0;
  lastScanAt = now;
  scanInFlight = true;
  let sold = 0;
  try {
    const orderStore = useOrderStore();
    const accountStore = useAccountStore();
    const targets = collectTargets(orderStore.orders);
    for (const target of targets) {
      const orderId = String(target.pred.OrderID ?? "").trim();
      if (!orderId)
        continue;
      const cd = cooldownUntil.get(orderId) ?? 0;
      if (now < cd)
        continue;

      const account = accountStore.findAccount(Number(target.pred.PlayerID));
      if (!account)
        continue;

      let sellProceedsCny = 0;
      let pmCost = 0;
      if (target.kind === "Polymarket") {
        const proceedsUsdc = await estimatePmSellProceedsUsdc(account, target.pred);
        if (!(proceedsUsdc > 0)) {
          cooldownUntil.set(orderId, now + ARB_EARLY_LOCK_COOLDOWN_MS);
          continue;
        }
        sellProceedsCny = usdtToCny(proceedsUsdc);
        pmCost = pmCostCny(target.pred);
      }
      else {
        const proceedsUsdt = estimatePfSellProceedsUsdt(target.pred);
        if (!(proceedsUsdt > 0)) {
          cooldownUntil.set(orderId, now + ARB_EARLY_LOCK_COOLDOWN_MS);
          continue;
        }
        sellProceedsCny = usdtToCny(proceedsUsdt);
        pmCost = pfCostCny(target.pred);
      }

      const totalCost = target.rows
        .filter(r =>
          String(r.Status ?? "") === "None"
          && !isMakeupSyntheticOrderRow(r)
          && r.PfSide !== "sell"
          && r.PmSide !== "sell",
        )
        .reduce((sum, r) => {
          const t = String(r.Type ?? "").trim();
          if (t === "Polymarket")
            return sum + pmCostCny(r);
          if (t === "PredictFun")
            return sum + pfCostCny(r);
          return sum + bookCostCny(r);
        }, 0);

      const should = decideArbEarlyLockSell({
        enabled: true,
        mode: prefs!.mode === "floor" ? "floor" : "pmEdge",
        minExtraProfit: prefs!.minExtraProfit,
        lockedProfitCny: target.lockedProfitCny,
        sellProceedsCny,
        pmCostCny: pmCost,
        totalCostCny: totalCost,
      });
      if (!should) {
        cooldownUntil.set(orderId, now + Math.min(15_000, ARB_EARLY_LOCK_COOLDOWN_MS));
        continue;
      }

      cooldownUntil.set(orderId, now + ARB_EARLY_LOCK_COOLDOWN_MS);
      const ok = target.kind === "Polymarket"
        ? await sellPm(account, target.pred)
        : await sellPf(account, target.pred);
      if (ok) {
        sold += 1;
        notify(
          "提前锁利",
          `${target.kind} Link ${target.linkId} 浮盈优于锁定利润，已自动卖出`,
        );
        try {
          await accountStore.refreshBalance(account);
        }
        catch { /* ignore */ }
      }
      else {
        notify("提前锁利失败", `${target.kind} ${orderId} 卖出未成功`);
      }
    }
    if (sold > 0) {
      try {
        await useOrderStore().fetchOrders();
      }
      catch { /* ignore */ }
    }
  }
  catch {
    /* never break main loop */
  }
  finally {
    scanInFlight = false;
  }
  return sold;
}
