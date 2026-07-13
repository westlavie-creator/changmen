import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pubsubSubscribe = vi.hoisted(() => vi.fn(async (_ch: string, handler: (c: string) => void) => {
  (globalThis as { __betTargetHandler?: (c: string) => void }).__betTargetHandler = handler;
}));

const applyRemoteBetTarget = vi.hoisted(() => vi.fn());

vi.mock("@/realtime/pubsubClient", () => ({
  pubsubSubscribe: (ch: string, handler: (c: string) => void) => pubsubSubscribe(ch, handler),
}));

vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({ applyRemoteBetTarget }),
}));

describe("betTargetChannel A8 parity", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    pubsubSubscribe.mockClear();
    applyRemoteBetTarget.mockClear();
    vi.resetModules();
  });

  it("subscribes BetTarget once and applies remote snapshot", async () => {
    const { ensureBetTargetChannelSubscribed } = await import("@/realtime/betTargetChannel");

    await ensureBetTargetChannelSubscribed();
    await ensureBetTargetChannelSubscribed();
    expect(pubsubSubscribe).toHaveBeenCalledOnce();
    expect(pubsubSubscribe.mock.calls[0]![0]).toBe("BetTarget");

    const handler = (globalThis as { __betTargetHandler?: (c: string) => void }).__betTargetHandler!;
    const payload = { PB: { 100: "Home", 101: "Away" } };
    handler(JSON.stringify(payload));

    expect(applyRemoteBetTarget).toHaveBeenCalledWith(payload);
  });
});
