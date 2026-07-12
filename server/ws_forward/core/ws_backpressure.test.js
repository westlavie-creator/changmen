import { describe, expect, it } from "vitest";
import { createWsRelayGuard, maxWsBufferedBytes } from "../core/ws_backpressure.js";

describe("ws_backpressure", () => {
  it("defaults to 512KB max buffered", () => {
    expect(maxWsBufferedBytes()).toBe(512 * 1024);
  });

  it("blocks send when bufferedAmount exceeds max", () => {
    const guard = createWsRelayGuard("PM-MARKET", "to-client");
    const ws = { OPEN: 1, readyState: 1, bufferedAmount: 1024 * 1024 };
    expect(guard.canSend(ws)).toBe(false);
    expect(guard.canSend({ OPEN: 1, readyState: 1, bufferedAmount: 0 })).toBe(true);
  });
});
