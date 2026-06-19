import { defineStore } from "pinia";
import { getOrderList } from "@/api/esport";
import type { OrderRow } from "@/types/order";
import {
  groupOrdersByLink,
  isLinkedArbOrderGroup,
  orderLinkLegend,
  orderLinkMapEntries,
} from "@/shared/orderLink";
import { useAccountStore } from "@/stores/accountStore";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
      if (!state.filterAccountId) return state.orders;
      const out = new Map<number, OrderRow[]>();
      for (const [link, rows] of state.orders) {
        const filtered = rows.filter((r) => r.PlayerID === state.filterAccountId);
        if (filtered.length) out.set(link, filtered);
      }
      return out;
    },

    /** 模板 v-for：顺序与 A8 groupBy(Link) 一致（已按 Link 降序） */
    orderEntries(): [number, OrderRow[]][] {
      return orderLinkMapEntries(this.filteredOrders);
    },

    accountOptions(): { value: number; label: string }[] {
      const accounts = useAccountStore().accounts;
      const opts = accounts.map((a) => ({
        value: a.accountId,
        label: `${a.platformName || a.provider}/${a.playerName}`,
      }));
      return [{ value: 0, label: "全部" }, ...opts];
    },
  },

  actions: {
    /** [A8 可证实] `Io.getOrders` / `E()`：`groupBy(Link)` + `updateTodayProfit` */
    async fetchOrders(date?: string) {
      const userStore = useUserStore();
      if (!userStore.userId) return false;
      const accountStore = useAccountStore();
      if (!accountStore.accounts.length && accountStore.loaded) {
        /* 允许空账号时仍拉订单 */
      }
      this.loading = true;
      try {
        this.orderDate = date ?? todayKey();
        const page = await getOrderList({ date: this.orderDate, pageSize: 1024 });
        if (!page) return false;
        const list = page.list ?? [];
        this.orders = groupOrdersByLink(list);
        this.updateTodayProfit(list);
        useMessageStore().orderReportMessage(accountStore.accounts, list);
        return true;
      } finally {
        this.loading = false;
      }
    },

    updateTodayProfit(list: OrderRow[]) {
      const accountStore = useAccountStore();
      const today = this.orderDate;
      const byPlayer = new Map<number, OrderRow[]>();
      for (const row of list) {
        const pid = Number(row.PlayerID) || 0;
        if (!byPlayer.has(pid)) byPlayer.set(pid, []);
        byPlayer.get(pid)!.push(row);
      }

      const accById = new Map(accountStore.accounts.map((a) => [a.accountId, a]));

      for (const acc of accById.values()) {
        acc.today = 0;
        acc.orderCount = 0;
        if (today === todayKey()) acc.todayOrder = 0;
      }

      for (const [playerId, rows] of byPlayer) {
        const acc = accById.get(playerId);
        if (!acc) continue;
        const profit = rows.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
        acc.today = Math.round(profit);
        acc.orderCount = rows.length;
        if (today === todayKey()) {
          acc.todayOrder = rows.length;
          const unsettled = rows.filter((r) => r.Status === "None");
          acc.unsettle = unsettled.length;
          acc.winBalance =
            (acc.balance ?? 0) +
            unsettled.reduce((sum, r) => sum + (Number(r.BetMoney) || 0) * (Number(r.Odds) || 0), 0);
        }
      }

      this.dayProfit = list.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
    },

    linkLegend(rows: OrderRow[]) {
      return orderLinkLegend(rows);
    },

    linkClass(rows: OrderRow[]) {
      const total = rows.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
      if (total === 0) return "default";
      return total > 0 ? "success" : "fail";
    },

    playerLabel(row: OrderRow) {
      const accountStore = useAccountStore();
      const acc = accountStore.findAccount(row.PlayerID);
      if (acc) {
        return `${accountStore.getPlatformName(acc.platformId, acc.platformName)} / ${acc.playerName}`;
      }
      if (row.Player?.Platform || row.Player?.UserName) {
        return `${row.Player.Platform || ""} / ${row.Player.UserName || ""}`.trim();
      }
      return "";
    },

    /** 对齐 A8 OrderView：暂停账号平台角标加 `.Stop` 删除线 */
    platformClass(row: OrderRow) {
      const acc = useAccountStore().findAccount(row.PlayerID);
      if (acc?.active) return "Stop";
      return undefined;
    },
  },
});
