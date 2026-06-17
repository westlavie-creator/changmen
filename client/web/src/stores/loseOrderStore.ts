import { defineStore } from "pinia";
import { LoseOrder } from "@/models/loseOrder";
import type { BetSide } from "@/models/match";
import type { FollowOrderInput, LoseOrderRecord } from "@/types/order";
import { loseOrderKey } from "@/stores/loseOrderKey";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";

const STORAGE_KEY = "LOSEORDER";

/** 对齐 A8 Pinia `jb`；Map 键为 `matchId:betId`（A8 仅 betId，见 loseOrderKey.ts） */
export const useLoseOrderStore = defineStore("loseorder", {
  state: () => ({
    orders: new Map<string, LoseOrder>(),
  }),

  getters: {
    count: (s) => s.orders.size,
  },

  actions: {
    restore() {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const list = JSON.parse(raw) as LoseOrderRecord[];
        this.orders = new Map(
          list.map((row) => [loseOrderKey(row.matchId, row.betId), new LoseOrder(row)]),
        );
      } catch {
        this.orders = new Map();
      }
    },

    ensureOrdersMap() {
      if (!(this.orders instanceof Map)) this.orders = new Map();
    },

    persist() {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...this.orders.values()].map((o) => o.toJSON())),
      );
    },

    hasOrder(matchId: number, betId: number) {
      return this.orders.has(loseOrderKey(matchId, betId));
    },

    createOrder(order: LoseOrder) {
      this.orders.set(loseOrderKey(order.matchId, order.betId), order);
      this.persist();
      // [A8 可证实] jb.createOrder：仅手动 isCreateOrder 时 PublishLoseOrderMessage
      if (order.isCreateOrder) {
        void useMessageStore().publishLoseOrderMessage();
      }
    },

    createFollowOrder(
      seed: { matchId: number; betId: number; target: BetSide; odds: number },
      follow: FollowOrderInput,
    ) {
      if (!follow?.isOpen || !follow.betMoney) return;
      const matchStore = useMatchStore();
      const match = matchStore.matchs.find((m) => m.id === seed.matchId);
      if (!match) return;
      const bet = match.bets.find((b) => b.id === seed.betId);
      if (!bet) return;
      const combinedOdds = Number(seed.odds) + Number(follow.odds ?? 0);
      const order = new LoseOrder({
        accountId: 0,
        matchId: seed.matchId,
        betId: seed.betId,
        target: seed.target,
        betMoney: Number(follow.betMoney),
        betOdds: combinedOdds,
        match: match.title,
        bet: bet.getBetName(),
        linkId: 0,
        createAt: Date.now(),
        isCreateOrder: true,
        betCount: 1,
      });
      this.createOrder(order);
    },

    removeOrder(matchId: number, betId: number, force = false) {
      const key = loseOrderKey(matchId, betId);
      const existing = this.orders.get(key);
      if (!existing) return;
      if (!force && existing.betCount > 1) {
        existing.betCount -= 1;
      } else {
        this.orders.delete(key);
      }
      this.persist();
    },

    removeOrders(activeKeys: string[]) {
      const active = new Set(activeKeys);
      for (const key of [...this.orders.keys()]) {
        if (!active.has(key)) {
          const order = this.orders.get(key);
          if (order) this.removeOrder(order.matchId, order.betId, true);
        }
      }
    },

    init() {
      this.restore();
      this.ensureOrdersMap();
    },
  },
});
