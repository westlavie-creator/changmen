import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";
import { createDefaultUserConfig } from "@/types/userConfig";

const prepareArbAttempt = vi.hoisted(() => vi.fn());
const checkArbLegs = vi.hoisted(() => vi.fn());
const placeArbLegs = vi.hoisted(() => vi.fn());
const finalizeArbBet = vi.hoisted(() => vi.fn());
const recordArbAttemptMetric = vi.hoisted(() => vi.fn());

vi.mock("@/stores/betting/autoBet/phases/prepareArbAttempt", () => ({
  prepareArbAttempt,
}));
vi.mock("@/stores/betting/autoBet/phases/checkArbLegs", () => ({
  checkArbLegs,
}));
vi.mock("@/stores/betting/autoBet/phases/placeArbLegs", () => ({
  placeArbLegs,
}));
vi.mock("@/stores/betting/autoBet/phases/finalizeArbBet", () => ({
  finalizeArbBet,
}));
vi.mock("@/stores/betting/autoBet/arbAttemptMetrics", () => ({
  recordArbAttemptMetric,
}));

describe("executeArbBet orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("预检通过后 place 失败结果仍调用 finalize", async () => {
    const ready = { linkId: 1 };
    const checked = { ...ready, waitSec: 10 };
    const placed = {
      ...checked,
      placeOutcomeA: "api_failed",
      placeOutcomeB: "not_attempted",
    };
    prepareArbAttempt.mockResolvedValue(ready);
    checkArbLegs.mockResolvedValue(checked);
    placeArbLegs.mockResolvedValue(placed);
    finalizeArbBet.mockResolvedValue(undefined);

    await executeArbBet({
      match: { id: 1 } as never,
      bet: { id: 10 } as never,
      config: createDefaultUserConfig(),
      setMessage: vi.fn(),
    });

    expect(placeArbLegs).toHaveBeenCalled();
    expect(finalizeArbBet).toHaveBeenCalledWith(expect.anything(), placed);
    expect(recordArbAttemptMetric).toHaveBeenCalledWith(
      expect.objectContaining({ stop: "complete" }),
    );
  });

  it("预检失败不 place / finalize", async () => {
    prepareArbAttempt.mockResolvedValue({ linkId: 1 });
    checkArbLegs.mockResolvedValue(null);

    await executeArbBet({
      match: { id: 1 } as never,
      bet: { id: 10 } as never,
      config: createDefaultUserConfig(),
      setMessage: vi.fn(),
    });

    expect(placeArbLegs).not.toHaveBeenCalled();
    expect(finalizeArbBet).not.toHaveBeenCalled();
    expect(recordArbAttemptMetric).toHaveBeenCalledWith(
      expect.objectContaining({ stop: "skip_check" }),
    );
  });
});
