import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const goeasySubscribe = vi.fn(async (_ch: string, handler: (c: string) => void) => {
  (globalThis as { __publishHandler?: (c: string) => void }).__publishHandler = handler;
});

vi.mock("@/realtime/goeasyClient", () => ({
  goeasySubscribe: (ch: string, handler: (c: string) => void) => goeasySubscribe(ch, handler),
}));

const createFollowOrder = vi.fn();

vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({ createFollowOrder }),
}));

const userState = {
  userId: 2,
  setting: { Follow: true } as Record<string, unknown>,
  follow: {
    isOpen: true,
    betMoney: 100,
    odds: 0.1,
    users: [1],
    minMoney: 50,
    maxMoney: 500,
  },
};

vi.mock("@/stores/userStore", () => ({
  useUserStore: () => userState,
}));

describe("publishChannel A8 follow parity", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    goeasySubscribe.mockClear();
    createFollowOrder.mockClear();
    userState.userId = 2;
    userState.setting = { Follow: true };
    userState.follow = {
      isOpen: true,
      betMoney: 100,
      odds: 0.1,
      users: [1],
      minMoney: 50,
      maxMoney: 500,
    };
    vi.resetModules();
  });

  it("subscribes Publish once and enqueues follow order on Betting", async () => {
    const { ensurePublishChannelSubscribed } = await import("@/realtime/publishChannel");
    await ensurePublishChannelSubscribed();
    await ensurePublishChannelSubscribed();
    expect(goeasySubscribe).toHaveBeenCalledOnce();
    expect(goeasySubscribe.mock.calls[0]![0]).toBe("Publish");

    const handler = (globalThis as { __publishHandler?: (c: string) => void }).__publishHandler!;
    handler(JSON.stringify({
      userId: 1,
      action: "Betting",
      data: {
        matchId: 10,
        betId: 20,
        target: "Home",
        betMoney: 200,
        odds: 1.9,
      },
    }));

    expect(createFollowOrder).toHaveBeenCalledWith(
      { matchId: 10, betId: 20, target: "Home", odds: 1.9 },
      userState.follow,
    );
  });

  it("ignores self, unpublished users, and out-of-range betMoney", async () => {
    const { ensurePublishChannelSubscribed } = await import("@/realtime/publishChannel");
    await ensurePublishChannelSubscribed();
    const handler = (globalThis as { __publishHandler?: (c: string) => void }).__publishHandler!;

    handler(JSON.stringify({
      userId: 2,
      action: "Betting",
      data: { matchId: 10, betId: 20, target: "Home", betMoney: 200, odds: 1.9 },
    }));
    handler(JSON.stringify({
      userId: 99,
      action: "Betting",
      data: { matchId: 10, betId: 20, target: "Home", betMoney: 200, odds: 1.9 },
    }));
    handler(JSON.stringify({
      userId: 1,
      action: "Betting",
      data: { matchId: 10, betId: 20, target: "Home", betMoney: 10, odds: 1.9 },
    }));

    expect(createFollowOrder).not.toHaveBeenCalled();
  });
});
