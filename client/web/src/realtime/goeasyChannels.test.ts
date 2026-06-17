import { beforeEach, describe, expect, it, vi } from "vitest";
import { handlePublishFollowMessage } from "@/realtime/goeasyChannels";
import type { FollowConfig } from "@/types/order";

describe("handlePublishFollowMessage", () => {
  const createFollowOrder = vi.fn();
  const follow: FollowConfig = {
    isOpen: true,
    betMoney: 100,
    minMoney: 50,
    maxMoney: 500,
    odds: 0.1,
    users: [42],
  };

  beforeEach(() => {
    createFollowOrder.mockClear();
  });

  it("creates follow lose order for publisher betting event", () => {
    handlePublishFollowMessage(
      JSON.stringify({
        userId: 42,
        action: "Betting",
        data: {
          matchId: 1,
          betId: 2,
          target: "Home",
          betMoney: 120,
          odds: 1.9,
          provider: "PB",
        },
      }),
      {
        user: { userId: 7, setting: { Follow: true }, follow },
        createFollowOrder,
      },
    );

    expect(createFollowOrder).toHaveBeenCalledOnce();
    expect(createFollowOrder.mock.calls[0][0]).toMatchObject({
      matchId: 1,
      betId: 2,
      target: "Home",
      betMoney: 120,
      odds: 1.9,
    });
  });

  it("ignores self, disabled follow, and out-of-range betMoney", () => {
    handlePublishFollowMessage(
      JSON.stringify({
        userId: 7,
        action: "Betting",
        data: { matchId: 1, betId: 2, target: "Home", betMoney: 120, odds: 1.9 },
      }),
      {
        user: { userId: 7, setting: { Follow: true }, follow },
        createFollowOrder,
      },
    );
    expect(createFollowOrder).not.toHaveBeenCalled();

    handlePublishFollowMessage(
      JSON.stringify({
        userId: 42,
        action: "Betting",
        data: { matchId: 1, betId: 2, target: "Home", betMoney: 10, odds: 1.9 },
      }),
      {
        user: { userId: 7, setting: { Follow: true }, follow },
        createFollowOrder,
      },
    );
    expect(createFollowOrder).not.toHaveBeenCalled();
  });
});
