import { beforeEach, describe, expect, test, vi } from "vitest";
import { handleIaRealtimeMessage } from "./messages";

const oddsStore = {
  isOdds: vi.fn(),
  save: vi.fn(),
  updateBetLock: vi.fn(),
};

const matchStore = {
  refreshOddsOnBets: vi.fn(),
};

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => oddsStore,
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => matchStore,
}));

describe("handleIaRealtimeMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oddsStore.isOdds.mockReturnValue(false);
  });

  test("locks IA bet items from single lock messages", () => {
    handleIaRealtimeMessage({
      message_type: "message_type_bet_item_single_lock",
      content: { play_id: 123, status: 0 },
    });

    expect(oddsStore.updateBetLock).toHaveBeenCalledWith("IA", "123", true);
    expect(matchStore.refreshOddsOnBets).toHaveBeenCalledOnce();
  });

  test("saves known IA point changes", () => {
    oddsStore.isOdds.mockImplementation((_platform: string, id: string) => id === "point-1");

    handleIaRealtimeMessage(
      {
        message_type: "message_type_push_point_change",
        content: { point_id: "point-1", point: "1.88", play_id: "play-1" },
      },
      12345,
    );

    expect(oddsStore.save).toHaveBeenCalledWith("IA", {
      id: "point-1",
      odds: 1.88,
      isLock: false,
      betId: "play-1",
      time: 12345,
    });
    expect(matchStore.refreshOddsOnBets).toHaveBeenCalledOnce();
  });

  test("ignores unknown IA point changes", () => {
    handleIaRealtimeMessage({
      message_type: "message_type_push_point_change",
      content: { point_id: "unknown", point: "2.10", play_id: "play-1" },
    });

    expect(oddsStore.save).not.toHaveBeenCalled();
    expect(matchStore.refreshOddsOnBets).not.toHaveBeenCalled();
  });
});
