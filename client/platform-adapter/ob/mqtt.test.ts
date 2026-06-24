import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  disconnectObMqtt,
  handleObMqttMessage,
  setObMqttCollectPlatform,
  syncObMqttSubscriptionsForGetMatchs,
} from "./mqtt";
import type { ViewMatch } from "@/models/match";
import type { CollectPlatformInfo } from "@/types/esport";

const refreshObMatchMarkets = vi.hoisted(() => vi.fn());

const oddsStore = {
  updateMessage: vi.fn(),
  isOdds: vi.fn(),
  getEntry: vi.fn(),
  save: vi.fn(),
  updateBetLock: vi.fn(),
};

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => oddsStore,
}));

vi.mock("./markets", () => ({
  refreshObMatchMarkets,
}));

describe("handleObMqttMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setObMqttCollectPlatform(null);
    oddsStore.isOdds.mockReturnValue(false);
    oddsStore.getEntry.mockReturnValue(undefined);
  });

  test("saves known odds updates from market oddsUpdate messages", () => {
    oddsStore.isOdds.mockImplementation((_platform: string, id: string) => id === "odd-1");
    oddsStore.getEntry.mockReturnValue({ betId: "market-old", side: "home" });

    handleObMqttMessage(
      "/market/oddsUpdate/123",
      JSON.stringify([
        { id: "odd-1", odd: "1.91", market_id: "market-1" },
        { id: "unknown", odd: "2.15", market_id: "market-2" },
      ]),
      () => {},
      12345,
    );

    expect(oddsStore.updateMessage).toHaveBeenCalledWith("OB", expect.any(String));
    expect(oddsStore.save).toHaveBeenCalledOnce();
    expect(oddsStore.save).toHaveBeenCalledWith(
      "OB",
      {
        id: "odd-1",
        odds: 1.91,
        isLock: false,
        betId: "market-1",
        side: "home",
        time: 12345,
      },
      "mqtt",
    );
  });

  test("locks markets from statusUpdate and suspended messages", () => {
    handleObMqttMessage("/market/statusUpdate/123", JSON.stringify([{ market_id: "m1" }]), () => {});
    handleObMqttMessage(
      "/market/suspended/123",
      JSON.stringify([{ market_id: "m2", suspended: 0 }]),
      () => {},
    );

    expect(oddsStore.updateBetLock).toHaveBeenNthCalledWith(1, "OB", "m1", true);
    expect(oddsStore.updateBetLock).toHaveBeenNthCalledWith(2, "OB", "m2", false);
  });

  test("ignores invalid payloads after recording the raw message", () => {
    handleObMqttMessage("/market/oddsUpdate/123", "not-json", () => {});

    expect(oddsStore.updateMessage).toHaveBeenCalledWith("OB", "not-json");
    expect(oddsStore.save).not.toHaveBeenCalled();
    expect(oddsStore.updateBetLock).not.toHaveBeenCalled();
  });
});

describe("syncObMqttSubscriptionsForGetMatchs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    disconnectObMqtt();
  });

  test("does not prepare OB markets before collector provides platform config", async () => {
    const match = { providers: { OB: "1001" } } as unknown as ViewMatch;

    await syncObMqttSubscriptionsForGetMatchs([match]);

    expect(refreshObMatchMarkets).not.toHaveBeenCalled();
  });

  test("reuses the latest OB collector platform config", async () => {
    const platform = {
      Gateway: "https://ob.example",
      BetName: "独赢",
    } as unknown as CollectPlatformInfo;
    const match = { providers: { OB: "1001" } } as unknown as ViewMatch;
    setObMqttCollectPlatform(platform);

    await syncObMqttSubscriptionsForGetMatchs([match]);

    expect(refreshObMatchMarkets).toHaveBeenCalledOnce();
    expect(refreshObMatchMarkets).toHaveBeenCalledWith(platform, "1001", match, expect.any(RegExp));
  });
});
