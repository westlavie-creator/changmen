import { describe, expect, test, vi } from "vitest";
import { handleRayRealtimeMessage } from "./collect";

describe("handleRayRealtimeMessage", () => {
  test("saves known RAY odds updates and ignores unknown rows", () => {
    const odds = {
      isOdds: vi.fn((platform: string, id: string) => platform === "RAY" && id === "known"),
      save: vi.fn(),
    };

    handleRayRealtimeMessage(
      {
        source: "odds",
        odds: [
          { id: "known", odds: 1.92, status: 1 },
          { id: "unknown", odds: 2.1, status: 1 },
          { id: "", odds: 3.2, status: 2 },
        ],
      },
      odds,
      12345,
    );

    expect(odds.save).toHaveBeenCalledOnce();
    expect(odds.save).toHaveBeenCalledWith("RAY", {
      id: "known",
      odds: 1.92,
      isLock: false,
      time: 12345,
    });
  });

  test("ignores non-odds messages", () => {
    const odds = {
      isOdds: vi.fn(),
      save: vi.fn(),
    };

    handleRayRealtimeMessage({ source: "match", match: { id: "m1" } }, odds, 12345);

    expect(odds.isOdds).not.toHaveBeenCalled();
    expect(odds.save).not.toHaveBeenCalled();
  });
});
