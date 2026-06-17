import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { LoseOrder } from "@/models/loseOrder";

const publishLoseOrderMessage = vi.fn();

vi.mock("@/stores/messageStore", () => ({
  useMessageStore: () => ({
    publishLoseOrderMessage,
  }),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    matchs: [
      {
        id: 1,
        title: "A vs B",
        bets: [{ id: 2, getBetName: () => "map1" }],
      },
    ],
  }),
}));

import { useLoseOrderStore } from "@/stores/loseOrderStore";

describe("useLoseOrderStore A8 publish parity", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    publishLoseOrderMessage.mockClear();
    vi.stubGlobal(
      "sessionStorage",
      {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
    );
  });

  it("publishes only for manual isCreateOrder create", () => {
    const store = useLoseOrderStore();
    store.createOrder(
      new LoseOrder({
        accountId: 0,
        matchId: 1,
        betId: 2,
        target: "Home",
        betMoney: 100,
        betOdds: 1.9,
        match: "A vs B",
        bet: "map1",
        linkId: 0,
        createAt: Date.now(),
        isCreateOrder: true,
        betCount: 1,
      }),
    );
    expect(publishLoseOrderMessage).toHaveBeenCalledOnce();

    publishLoseOrderMessage.mockClear();
    store.createOrder(
      new LoseOrder({
        accountId: 1,
        matchId: 1,
        betId: 3,
        target: "Away",
        betMoney: 100,
        betOdds: 2.1,
        match: "A vs B",
        bet: "map1",
        linkId: 123,
        createAt: Date.now(),
        isCreateOrder: false,
        betCount: 1,
      }),
    );
    expect(publishLoseOrderMessage).not.toHaveBeenCalled();
  });

  it("does not publish on remove", () => {
    const store = useLoseOrderStore();
    store.createOrder(
      new LoseOrder({
        accountId: 0,
        matchId: 1,
        betId: 2,
        target: "Home",
        betMoney: 100,
        betOdds: 1.9,
        match: "A vs B",
        bet: "map1",
        linkId: 0,
        createAt: Date.now(),
        isCreateOrder: true,
        betCount: 1,
      }),
    );
    publishLoseOrderMessage.mockClear();
    store.removeOrder(2, true);
    expect(publishLoseOrderMessage).not.toHaveBeenCalled();
  });
});
