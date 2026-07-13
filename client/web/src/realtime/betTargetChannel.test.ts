import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const goeasySubscribe = vi.hoisted(() => vi.fn(async (_ch: string, handler: (c: string) => void) => {
  (globalThis as { __betTargetHandler?: (c: string) => void }).__betTargetHandler = handler;
}));

const applyRemoteBetTarget = vi.hoisted(() => vi.fn());

vi.mock("@/realtime/goeasyClient", () => ({
  goeasySubscribe: (ch: string, handler: (c: string) => void) => goeasySubscribe(ch, handler),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({ applyRemoteBetTarget }),
}));

describe("betTargetChannel A8 parity", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    goeasySubscribe.mockClear();
    applyRemoteBetTarget.mockClear();
    vi.resetModules();
  });

  it("subscribes BetTarget once and applies remote snapshot", async () => {
    const { ensureBetTargetChannelSubscribed } = await import("@/realtime/betTargetChannel");

    await ensureBetTargetChannelSubscribed();
    await ensureBetTargetChannelSubscribed();
    expect(goeasySubscribe).toHaveBeenCalledOnce();
    expect(goeasySubscribe.mock.calls[0]![0]).toBe("BetTarget");

    const handler = (globalThis as { __betTargetHandler?: (c: string) => void }).__betTargetHandler!;
    const payload = { PB: { 100: "Home", 101: "Away" } };
    handler(JSON.stringify(payload));

    expect(applyRemoteBetTarget).toHaveBeenCalledWith(payload);
  });
});
