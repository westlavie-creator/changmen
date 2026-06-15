import { defineStore } from "pinia";
import { getOrderList } from "@/api/esport";
import type { OrderRow } from "@/types/order";
import { toFixed, formatLinkId, isSingleLegLink } from "@/shared/format";
import { useAccountStore } from "@/stores/accountStore";
import { useMessageStore } from "@/stores/messageStore";

const LOSE_REJECT = new Set(["Reject", "Return"]);

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function groupKey(row: OrderRow) {
  return Number(row.Link) || Number(row.OrderID) || 0;
}

function groupByLink(list: OrderRow[]) {
  const map = new Map<number, OrderRow[]>();
  for (const row of list) {
    const link = groupKey(row);
    if (!map.has(link)) map.set(link, []);
    map.get(link)!.push(row);
  }
  return map;
}

function sortRowsInGroup(rows: OrderRow[]) {
  return [...rows].sort(
    (a, b) => (Number(a.CreateAt) || 0) - (Number(b.CreateAt) || 0),
  );
}

/** 订单组按组内最新 CreateAt 降序；组内按 CreateAt 升序（套利双腿固定在同一 fieldset） */
export function sortOrderGroupEntries(
  map: Map<number, OrderRow[]>,
): [number, OrderRow[]][] {
  return [...map.entries()]
    .map(([key, rows]) => [key, sortRowsInGroup(rows)] as [number, OrderRow[]])
    .sort((a, b) => {
      const ta = Math.max(...a[1].map((r) => Number(r.CreateAt) || 0));
      const tb = Math.max(...b[1].map((r) => Number(r.CreateAt) || 0));
      return tb - ta;
    });
}

export function isLinkedArbGroup(rows: OrderRow[]) {
  const link = Number(rows[0]?.Link) || 0;
  return link !== 0 && !isSingleLegLink(link) && rows.length > 1;
}

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

    /** 模板 v-for 用：按最新下单时间排序，同 Link 套利双腿为一组 */
    orderEntries(): [number, OrderRow[]][] {
      return sortOrderGroupEntries(this.filteredOrders);
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
    async fetchOrders(date?: string) {
      const accountStore = useAccountStore();
      if (!accountStore.accounts.length && accountStore.loaded) {
        /* 允许空账号时仍拉订单 */
      }
      this.loading = true;
      try {
        this.orderDate = date || todayKey();
        const page = await getOrderList({ date: this.orderDate, pageSize: 1024 });
        const list = page.list || [];
        this.orders = groupByLink(list);
        this.updateTodayProfit(list);
        useMessageStore().orderReportMessage(accountStore.accounts, list);
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
      const link = Number(rows[0]?.Link) || 0;
      const prefix = isSingleLegLink(link) ? `${formatLinkId(link)} ` : "";
      const stake = rows
        .filter((r) => !LOSE_REJECT.has(String(r.Status)))
        .reduce((sum, r) => sum + (Number(r.BetMoney) || 0), 0);
      const unsettled = rows
        .filter((r) => r.Status === "None")
        .map((r) => {
          const odds = Number(r.Odds) || 0;
          const bet = Number(r.BetMoney) || 0;
          return toFixed(bet * odds - stake, 0);
        });
      if (unsettled.length) return prefix + unsettled.join(" - ");
      const total = rows.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
      return prefix + toFixed(total, 0);
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
