import type { OrderRow } from "@/types/order";
import { defineStore } from "pinia";
import { getOrderList } from "@/api/esport";
import {
  dropOrphanPolymarketSellGroups,
  filterOrdersBelongingToDate,
  groupOrdersByLink,
  isLinkedArbOrderGroup,
  isPolymarketOpenPosition,
  orderBelongsToDateKey,
  orderLinkLegend,
  orderLinkMapEntries,
  toOrderDateKeyLocal,
  computeOrderGroupProfit,
} from "@/shared/orderLink";
import { accountOrderDisplayName } from "@/shared/accountDisplayName";
import { useAccountStore } from "@/stores/accountStore";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

function todayKey() {
  return toOrderDateKeyLocal(Date.now());
}

/** 已手动平仓的 PM 买单：盈亏在同组卖单，不计入买单 Money */
function pmBuyMoneyCountsTowardDayProfit(row: OrderRow, peers: OrderRow[]): boolean {
  if (String(row.Type ?? "").trim() !== "Polymarket")
    return true;
  if (row.PmSide === "sell")
    return true;
  const buyId = String(row.OrderID ?? "").trim().toLowerCase();
  // 同列表已有指向本买单的卖单 → 一律不计买单 Money（防脏数据双计）
  if (buyId && peers.some(r =>
    String(r.Type ?? "").trim() === "Polymarket"
    && r.PmSide === "sell"
    && String(r.PmBuyOrderId ?? "").trim().toLowerCase() === buyId
  ))
    return false;
  const state = String(row.PmSellState ?? "").toLowerCase();
  const attr = Number(row.PmAttributedSellShares) || 0;
  if (state === "closed" || state === "partial")
    return false;
  if (state === "settled" && attr > 0)
    return false;
  return true;
}

export { isLinkedArbOrderGroup as isLinkedArbGroup };

/** 对齐 A8 `Io.getOrders` / `orders` / `orderDate` */
export const useOrderStore = defineStore("order", {
  state: () => ({
    orders: new Map<number, OrderRow[]>(),
    orderDate: todayKey(),
    dayProfit: 0,
    loading: false,
    filterAccountId: 0,
  }),

  getters: {
    filteredOrders(state): Map<number, OrderRow[]> {
      if (!state.filterAccountId)
        return state.orders;
      const out = new Map<number, OrderRow[]>();
      for (const [link, rows] of state.orders) {
        const filtered = rows.filter(r => r.PlayerID === state.filterAccountId);
        if (filtered.length)
          out.set(link, filtered);
      }
      return out;
    },

    /** 模板 v-for：顺序与 A8 groupBy(Link) 一致（已按 Link 降序） */
    orderEntries(): [number, OrderRow[]][] {
      return orderLinkMapEntries(this.filteredOrders);
    },

    accountOptions(): { value: number; label: string }[] {
      const accounts = useAccountStore().accounts;
      const opts = accounts.map(a => ({
        value: a.accountId,
        label: `${a.platformName || a.provider}/${accountOrderDisplayName(a)}`,
      }));
      return [{ value: 0, label: "全部" }, ...opts];
    },
  },

  actions: {
    /** [A8 可证实] `Io.getOrders` / `E()`：`groupBy(Link)` + `updateTodayProfit` */
    async fetchOrders(date?: string) {
      const userStore = useUserStore();
      if (!userStore.userId)
        return false;
      const accountStore = useAccountStore();
      if (!accountStore.accounts.length && accountStore.loaded) {
        /* 允许空账号时仍拉订单 */
      }
      this.loading = true;
      try {
        const nextDate = date ?? todayKey();
        this.orderDate = nextDate;
        const page = await getOrderList({ date: this.orderDate, pageSize: 1024 });
        if (!page)
          return false;
        // PM 卖单归买单日：后端已滤；前端再滤一次防脏数据
        const list = filterOrdersBelongingToDate(page.list ?? [], this.orderDate);
        this.orders = dropOrphanPolymarketSellGroups(groupOrdersByLink(list));
        this.updateTodayProfit(list);
        const reportRows = list
          .filter(r => orderBelongsToDateKey(r, this.orderDate, list))
          .map(r => (
            pmBuyMoneyCountsTowardDayProfit(r, list) ? r : { ...r, Money: 0 }
          ));
        useMessageStore().orderReportMessage(accountStore.accounts, reportRows);
        return true;
      }
      finally {
        this.loading = false;
      }
    },

    updateTodayProfit(list: OrderRow[]) {
      const accountStore = useAccountStore();
      const today = this.orderDate;
      /** 展示可含跨日 sibling；盈亏只计归账日落在当日的行（PM 卖单跟买单日） */
      const inDay = list.filter(r => orderBelongsToDateKey(r, today, list));
      const moneyOf = (r: OrderRow) =>
        pmBuyMoneyCountsTowardDayProfit(r, inDay) ? (Number(r.Money) || 0) : 0;
      const byPlayer = new Map<number, OrderRow[]>();
      for (const row of inDay) {
        const pid = Number(row.PlayerID) || 0;
        if (!byPlayer.has(pid))
          byPlayer.set(pid, []);
        byPlayer.get(pid)!.push(row);
      }

      const accById = new Map(accountStore.accounts.map(a => [a.accountId, a]));

      for (const acc of accById.values()) {
        acc.today = 0;
        acc.orderCount = 0;
        if (today === todayKey())
          acc.todayOrder = 0;
      }

      for (const [playerId, rows] of byPlayer) {
        const acc = accById.get(playerId);
        if (!acc)
          continue;
        const profit = rows.reduce((sum, r) => sum + moneyOf(r), 0);
        acc.today = Math.round(profit);
        acc.orderCount = rows.length;
        if (today === todayKey()) {
          acc.todayOrder = rows.length;
          const unsettled = rows.filter((r) => {
            if (String(r.Status ?? "") !== "None")
              return false;
            if (String(r.Type ?? "") === "Polymarket")
              return isPolymarketOpenPosition(r);
            return true;
          });
          acc.unsettle = unsettled.length;
          acc.winBalance
            = (acc.balance ?? 0)
              + unsettled.reduce((sum, r) => sum + (Number(r.BetMoney) || 0) * (Number(r.Odds) || 0), 0);
        }
      }

      this.dayProfit = inDay.reduce((sum, r) => sum + moneyOf(r), 0);
    },

    linkLegend(rows: OrderRow[]) {
      return orderLinkLegend(rows);
    },

    linkClass(rows: OrderRow[]) {
      const total = computeOrderGroupProfit(rows);
      if (total === 0)
        return "default";
      return total > 0 ? "success" : "fail";
    },

    playerLabel(row: OrderRow) {
      const accountStore = useAccountStore();
      const acc = accountStore.findAccount(row.PlayerID);
      if (acc) {
        const platform = accountStore.getPlatformName(acc.platformId, acc.platformName);
        return `${platform} / ${accountOrderDisplayName(acc)}`;
      }
      if (row.Player?.Platform || row.Player?.UserName) {
        return `${row.Player.Platform || ""} / ${row.Player.UserName || ""}`.trim();
      }
      return "";
    },

    /** 对齐 A8 OrderView：暂停账号平台角标加 `.Stop` 删除线 */
    platformClass(row: OrderRow) {
      const acc = useAccountStore().findAccount(row.PlayerID);
      if (acc?.active)
        return "Stop";
      return undefined;
    },
  },
});
