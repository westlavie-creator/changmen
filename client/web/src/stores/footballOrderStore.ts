import { defineStore } from "pinia";
import { getFootballOrders, patchFootballOrderStatus, saveFootballOrder, type FootballOrderDto } from "@/api/footballOrder";
import { pickObSportBetAccount } from "@/runtime/obSportBetAccount";
import type { ObSportOrderStatusPatch } from "@/runtime/obSportOrderStatus";
import { readPodBetSettings } from "@/runtime/podBetSettings";
import {
  footballOrderSettledProfit,
  isFootballOrderPending,
  mergePodSportOrder,
  parsePodSportOrders,
  type PodSportOrder,
} from "@/runtime/podSportOrders";
import { accountOrderDisplayName } from "@/shared/accountDisplayName";
import { todayKey } from "@/shared/dateKey";
import { useAccountStore } from "@/stores/accountStore";

function asDto(row: PodSportOrder | FootballOrderDto): FootballOrderDto {
  return row;
}

let loadSeq = 0;

/**
 * 足球订单：对齐电竞 orderStore（Pinia 内存 + 按日 RDS），不写 localStorage。
 * 禁止 useOrderStore / Client_SaveOrder / Client_GetOrderList。
 */
export const useFootballOrderStore = defineStore("footballOrders", {
  state: () => ({
    rows: [] as FootballOrderDto[],
    loaded: false,
    loading: false,
    persistError: "",
    orderDate: todayKey(),
    filterAccountId: 0,
  }),
  getters: {
    count(): number {
      return this.rows.length;
    },
    todayStake(): number {
      let sum = 0;
      for (const row of this.rows)
        sum += Number(row.stake) || 0;
      return sum;
    },
    todayProfit(): number {
      let sum = 0;
      for (const row of this.rows)
        sum += footballOrderSettledProfit(row);
      return sum;
    },
    todayOpenStake(): number {
      let sum = 0;
      for (const row of this.rows) {
        if (isFootballOrderPending(row.status))
          sum += Number(row.stake) || 0;
      }
      return sum;
    },
    filteredRows(): FootballOrderDto[] {
      if (!this.filterAccountId)
        return this.rows;
      return this.rows.filter(row => Number(row.playerId) === this.filterAccountId);
    },
    accountOptions(): { value: number; label: string }[] {
      const accounts = useAccountStore().accounts;
      const seen = new Set(accounts.map(a => a.accountId));
      const opts = accounts.map(a => ({
        value: a.accountId,
        label: `${a.platformName || a.provider}/${accountOrderDisplayName(a)}`,
      }));
      for (const row of this.rows) {
        const pid = Number(row.playerId) || 0;
        if (!pid || seen.has(pid))
          continue;
        seen.add(pid);
        const name = String(row.accountName || "").trim() || `#${pid}`;
        const venue = String(row.venue || "OB").trim();
        opts.push({ value: pid, label: `${venue}/${name}` });
      }
      return [{ value: 0, label: "全部" }, ...opts];
    },
  },
  actions: {
    playerLabel(row: FootballOrderDto): string {
      const pid = Number(row.playerId) || 0;
      const acc = pid ? useAccountStore().findAccount(pid) : null;
      if (acc) {
        const platform = acc.platformName || acc.provider || row.venue || "OB";
        return `${platform} / ${accountOrderDisplayName(acc)}`;
      }
      const venue = String(row.venue || "OB").trim();
      const name = String(row.accountName || "").trim();
      if (name)
        return `${venue} / ${name}`;
      return pid ? `${venue} / #${pid}` : venue;
    },
    platformClass(row: FootballOrderDto): string | undefined {
      const pid = Number(row.playerId) || 0;
      const acc = pid ? useAccountStore().findAccount(pid) : null;
      if (acc?.active)
        return "Stop";
      return undefined;
    },
    async load(date?: string) {
      const seq = ++loadSeq;
      this.loading = true;
      try {
        const nextDate = date || this.orderDate || todayKey();
        this.orderDate = nextDate;
        const server = await getFootballOrders({ date: nextDate });
        if (seq !== loadSeq)
          return;
        this.rows = parsePodSportOrders(server) as FootballOrderDto[];
        this.loaded = true;
        this.persistError = "";
      }
      catch (err) {
        if (seq !== loadSeq)
          return;
        this.persistError = err instanceof Error ? err.message : String(err);
      }
      finally {
        if (seq === loadSeq)
          this.loading = false;
      }
    },
    async persist(row: FootballOrderDto) {
      loadSeq += 1;
      try {
        const saved = await saveFootballOrder(row);
        if (!saved || typeof saved !== "object")
          throw new Error("保存未返回订单");
        const next = asDto({ ...row, ...saved, id: saved.id || row.id });
        this.rows = mergePodSportOrder(this.rows, next) as FootballOrderDto[];
        this.persistError = "";
        void this.load();
        return next;
      }
      catch (err) {
        this.persistError = err instanceof Error ? err.message : String(err);
        this.rows = mergePodSportOrder(this.rows, row) as FootballOrderDto[];
        this.loading = false;
        return row;
      }
    },
    async appendPlaced(row: PodSportOrder) {
      const account = pickObSportBetAccount(
        useAccountStore().accounts,
        readPodBetSettings().followAccountId,
      ) as
        | { accountId?: number; playerName?: string }
        | null;
      const dto: FootballOrderDto = {
        ...row,
        status: row.status || "None",
        profit: Number(row.profit) || 0,
        venue: "OB",
        playerId: Number(account?.accountId) || 0,
        accountName: String(account?.playerName || ""),
      };
      return this.persist(dto);
    },
    async applyVenueStatus(patches: ObSportOrderStatusPatch[]) {
      if (!patches.length)
        return;
      let touched = false;
      for (const patch of patches) {
        const orderId = String(patch.orderId || "").trim();
        if (!orderId)
          continue;
        const row = this.rows.find(item => item.orderId === orderId);
        if (row && row.status === patch.status && Number(row.profit) === Number(patch.profit))
          continue;
        try {
          const saved = row
            ? await saveFootballOrder({ ...row, status: patch.status, profit: patch.profit })
            : await patchFootballOrderStatus({
              orderId,
              status: patch.status,
              profit: patch.profit,
              venue: "OB",
            });
          if (!saved || typeof saved !== "object")
            continue;
          const next = asDto({ ...(row || saved), ...saved, id: saved.id || row?.id || orderId });
          if (!next.id)
            continue;
          this.rows = mergePodSportOrder(this.rows, next) as FootballOrderDto[];
          this.persistError = "";
          touched = true;
        }
        catch (err) {
          this.persistError = err instanceof Error ? err.message : String(err);
        }
      }
      if (touched)
        void this.load();
    },
  },
});
