import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KAKAXI_DRAIN_WAKE_DEBOUNCE_MS } from "@/stores/betting/kakaxi/config";

const drainKakaxiScheduler = vi.fn(async () => 1);
const config = { betting: true };
const setMessage = vi.fn();
let queueSize = 1;

vi.mock("@/stores/betting/kakaxi/scheduler", () => ({
  drainKakaxiScheduler: (...args: unknown[]) => drainKakaxiScheduler(...args),
}));

vi.mock("@/stores/configStore", () => ({
  useConfigStore: () => ({ config }),
}));

vi.mock("@/stores/bettingStore", () => ({
  useBettingStore: () => ({ setMessage }),
}));

vi.mock("@/stores/betting/kakaxi/queue", () => ({
  kakaxiQueueSize: () => queueSize,
}));

import {
  resetKakaxiDrainWake,
  wakeKakaxiDrain,
} from "@/stores/betting/kakaxi/drainWake";

describe("wakeKakaxiDrain", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    config.betting = true;
    queueSize = 1;
    drainKakaxiScheduler.mockReset();
    drainKakaxiScheduler.mockImplementation(async () => {
      queueSize = 0;
      return 1;
    });
    setMessage.mockClear();
    resetKakaxiDrainWake();
  });

  afterEach(() => {
    resetKakaxiDrainWake();
    vi.useRealTimers();
  });

  it("does nothing when betting is off", async () => {
    config.betting = false;
    wakeKakaxiDrain(true);
    await vi.runAllTimersAsync();
    expect(drainKakaxiScheduler).not.toHaveBeenCalled();
  });

  it("drains immediately for urgent live wake", async () => {
    wakeKakaxiDrain(true);
    await vi.runAllTimersAsync();
    expect(drainKakaxiScheduler).toHaveBeenCalledOnce();
    expect(setMessage).not.toHaveBeenCalled();
    const ctx = drainKakaxiScheduler.mock.calls[0]?.[0] as {
      setMessage: (msg: string) => void;
    };
    ctx.setMessage("ok");
    expect(setMessage).toHaveBeenCalledWith("ok");
  });

  it("debounces non-urgent wake", async () => {
    wakeKakaxiDrain(false);
    await vi.advanceTimersByTimeAsync(KAKAXI_DRAIN_WAKE_DEBOUNCE_MS - 1);
    expect(drainKakaxiScheduler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(drainKakaxiScheduler).toHaveBeenCalledOnce();
  });

  it("upgrades pending wake to urgent", async () => {
    wakeKakaxiDrain(false);
    wakeKakaxiDrain(true);
    await vi.runAllTimersAsync();
    expect(drainKakaxiScheduler).toHaveBeenCalledOnce();
  });
});
