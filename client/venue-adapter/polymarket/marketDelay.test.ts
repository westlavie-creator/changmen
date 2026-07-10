import { describe, expect, it } from "vitest";
import {
  buildPolymarketDelayedPollOpts,
  buildPolymarketWatchTimeoutMs,
  parsePolymarketClobMarketDelay,
} from "./marketDelay";

describe("parsePolymarketClobMarketDelay", () => {
  it("reads official sd / itode from CLOB market row", () => {
    expect(parsePolymarketClobMarketDelay({ sd: 3, itode: true })).toEqual({
      secondsDelay: 3,
      takerOrderDelayEnabled: true,
    });
  });

  it("defaults sd to 1 when missing", () => {
    expect(parsePolymarketClobMarketDelay({})).toEqual({
      secondsDelay: 1,
      takerOrderDelayEnabled: false,
    });
  });
});

describe("buildPolymarketDelayedPollOpts", () => {
  it("waits full sd window before first poll (sd=1)", () => {
    const opts = buildPolymarketDelayedPollOpts(1);
    expect(opts.initialDelayMs).toBe(1_000);
    expect(opts.intervalMs).toBe(1_000);
    expect(opts.maxAttempts).toBeGreaterThanOrEqual(8);
  });

  it("scales initial delay with sd=3 (sports example)", () => {
    const opts = buildPolymarketDelayedPollOpts(3);
    expect(opts.initialDelayMs).toBe(3_000);
    expect(opts.maxAttempts).toBeGreaterThanOrEqual(8);
  });
});

describe("buildPolymarketWatchTimeoutMs", () => {
  it("covers poll budget plus buffer", () => {
    const poll = buildPolymarketDelayedPollOpts(1);
    const timeout = buildPolymarketWatchTimeoutMs(1);
    expect(timeout).toBeGreaterThan(
      poll.initialDelayMs + poll.intervalMs * poll.maxAttempts,
    );
  });
});
