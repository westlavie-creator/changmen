import { defineStore } from "pinia";
import { getFootballOrders, patchFootballOrderStatus, saveFootballOrder, type FootballOrderDto } from "@/api/footballOrder";
import { fetchObSportOrderStatusPatches } from "@/runtime/obSportBetRecord";
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

function dateOf(row: Pick<FootballOrderDto, "at">): string {
  const at = Number(row.at) || 0;
  return todayKey(at > 0 ? new Date(at) : new Date());
}

let loadSeq = 0;
let syncing = false;
let settleTimer: ReturnType<typeof setTimeout> | null = null;

export function stopFootballOrderRuntime() {
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  syncing = false;
}

/**
 * 足球订单：对齐电竞 orderStore（Pinia 内存 + 按日 RDS），不写 localStorage。
 * 禁止 useOrderStore / Client_SaveOrder / Client_GetOrderList。
 * 禁止写 PlatformAccount.today / unsettle / orderCount / winBalance（电竞账号条字段）。
 */
export const useFootballOrderStore = defineStore("footballOrders", {
  state: () => ({
    rows: [] as FootballOrderDto[],
    todayRows: [] as FootballOrderDto[],
    loaded: false,
    loading: false,
    persistError: "",
    orderDate: todayKey(),
    filterAccountId: 0,
  }),
  getters: {
    count(): number {
      return this.todayRows.length;
    },
    todayStake(): number {
      let sum = 0;
      for (const row of this.todayRows)
        sum += Number(row.stake) || 0;
      return sum;
    },
    todayProfit(): number {
      let sum = 0;
      for (const row of this.todayRows)
        sum += footballOrderSettledProfit(row);
      return sum;
    },
    todayOpenStake(): number {
      let sum = 0;
      for (const row of this.todayRows) {
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
    mergeLocal(row: FootballOrderDto) {
      const next = asDto(row);
      if (dateOf(next) === this.orderDate)
        this.rows = mergePodSportOrder(this.rows, next) as FootballOrderDto[];
      if (dateOf(next) === todayKey())
        this.todayRows = this.orderDate === todayKey()
          ? this.rows
          : mergePodSportOrder(this.todayRows, next) as FootballOrderDto[];
    },
    async load(date?: string) {
      const seq = ++loadSeq;
      this.loading = true;
      try {
        const nextDate = date || this.orderDate || todayKey();
        this.orderDate = nextDate;
        const today = todayKey();
        const [server, todayServer] = await Promise.all([
          getFootballOrders({ date: nextDate }),
          nextDate === today ? Promise.resolve(null) : getFootballOrders({ date: today }),
        ]);
        if (seq !== loadSeq)
          return;
        this.rows = parsePodSportOrders(server) as FootballOrderDto[];
        this.todayRows = todayServer == null
          ? this.rows
          : parsePodSportOrders(todayServer) as FootballOrderDto[];
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
      try {
        const saved = await saveFootballOrder(row);
        if (!saved || typeof saved !== "object")
          throw new Error("保存未返回订单");
        const next = asDto({ ...row, ...saved, id: saved.id || row.id });
        this.mergeLocal(next);
        this.persistError = "";
        return next;
      }
      catch (err) {
        this.persistError = err instanceof Error ? err.message : String(err);
        this.mergeLocal(row);
        this.loading = false;
        return row;
      }
    },
    async appendPlaced(
      row: PodSportOrder,
      account?: { accountId?: number; playerName?: string } | null,
    ) {
      const picked = account || pickObSportBetAccount(
        useAccountStore().accounts,
        readPodBetSettings().followAccountIds[0] || readPodBetSettings().followAccountId,
      ) as
        | { accountId?: number; playerName?: string }
        | null;
      const dto: FootballOrderDto = {
        ...row,
        status: row.status || "None",
        profit: Number(row.profit) || 0,
        venue: "OB",
        playerId: Number(row.playerId) || Number(picked?.accountId) || 0,
        accountName: String(row.accountName || picked?.playerName || ""),
      };
      const saved = await this.persist(dto);
      this.syncVenueSettlementSoon();
      return saved;
    },
    async applyVenueStatus(patches: ObSportOrderStatusPatch[]) {
      if (!patches.length)
        return;
      for (const patch of patches) {
        const orderId = String(patch.orderId || "").trim();
        if (!orderId)
          continue;
        const row = this.rows.find(item => item.orderId === orderId)
          || this.todayRows.find(item => item.orderId === orderId);
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
          this.mergeLocal(next);
          this.persistError = "";
        }
        catch (err) {
          this.persistError = err instanceof Error ? err.message : String(err);
        }
      }
    },
    async syncVenueSettlement() {
      if (syncing)
        return;
      const pending = [...this.todayRows, ...this.rows]
        .filter(row => isFootballOrderPending(row.status) && String(row.orderId || "").trim());
      const ids = [...new Set(pending.map(row => String(row.orderId).trim()))];
      if (!ids.length)
        return;
      syncing = true;
      try {
        const patches = await fetchObSportOrderStatusPatches(ids);
        await this.applyVenueStatus(patches);
      }
      catch (err) {
        if (import.meta.env?.DEV)
          console.warn("[football] venue settlement skipped", err);
      }
      finally {
        syncing = false;
      }
    },
    syncVenueSettlementSoon(delayMs = 2500) {
      if (settleTimer)
        clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        void this.syncVenueSettlement();
      }, delayMs);
    },
  },
});
