import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./transport", () => ({
  polymarketPluginPost: vi.fn(),
}));

vi.mock("./l2Auth", () => ({
  parseTokenConfig: vi.fn(() => ({})),
  resolveApiCreds: vi.fn(() => ({
    address: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    apiKey: "key-1",
    secret: "c2VjcmV0",
    passphrase: "pass-1",
  })),
  buildL2Headers: vi.fn(async () => ({})),
}));

import { polymarketPluginPost } from "./transport";
import {
  ensurePolymarketHeartbeat,
  getPolymarketHeartbeatAccountIdsForTests,
  POLYMARKET_HEARTBEAT_INTERVAL_MS,
  stopAllPolymarketHeartbeats,
  stopPolymarketHeartbeat,
} from "./pmHeartbeat";

describe("pmHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(polymarketPluginPost).mockReset();
    vi.mocked(polymarketPluginPost).mockResolvedValue({ heartbeat_id: "hb-1" });
    stopAllPolymarketHeartbeats();
  });

  afterEach(() => {
    stopAllPolymarketHeartbeats();
    vi.useRealTimers();
  });

  it("starts heartbeat once per account and posts /v1/heartbeats", async () => {
    const account = {
      accountId: 42,
      gateway: "https://clob.polymarket.com",
      token: "{}",
    } as any;

    ensurePolymarketHeartbeat(account);
    ensurePolymarketHeartbeat(account);

    expect(getPolymarketHeartbeatAccountIdsForTests()).toEqual([42]);
    await Promise.resolve();
    await Promise.resolve();

    expect(polymarketPluginPost).toHaveBeenCalled();
    const [url, body] = vi.mocked(polymarketPluginPost).mock.calls[0]!;
    expect(url).toBe("https://clob.polymarket.com/v1/heartbeats");
    expect(body).toEqual({ heartbeat_id: "" });

    const callsAfterStart = vi.mocked(polymarketPluginPost).mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLYMARKET_HEARTBEAT_INTERVAL_MS);
    expect(vi.mocked(polymarketPluginPost).mock.calls.length).toBeGreaterThan(callsAfterStart);
  });

  it("stop removes session", () => {
    ensurePolymarketHeartbeat({ accountId: 7, gateway: "https://clob.polymarket.com", token: "{}" } as any);
    stopPolymarketHeartbeat(7);
    expect(getPolymarketHeartbeatAccountIdsForTests()).toEqual([]);
  });
});
