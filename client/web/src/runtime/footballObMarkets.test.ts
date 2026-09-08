import { afterEach, describe, expect, it, vi } from "vitest";

const fetchObFootballMatchMarkets = vi.fn();

vi.mock("@/runtime/obSportFootballFetch", () => ({
  fetchObFootballMatchMarkets: (...args: unknown[]) => fetchObFootballMatchMarkets(...args),
}));

const { isFootballObMarketsComplete, loadFootballObMarkets, peekFootballObMarkets, invalidateFootballObMarkets }
  = await import("@/runtime/footballObMarkets");

describe("footballObMarkets cache", () => {
  afterEach(() => {
    invalidateFootballObMarkets("m1");
    fetchObFootballMatchMarkets.mockReset();
  });

  it("treats an empty fetch as complete so the card does not keep reloading", async () => {
    fetchObFootballMatchMarkets.mockResolvedValueOnce([]);
    const rows = await loadFootballObMarkets("m1");
    expect(rows).toEqual([]);
    expect(isFootballObMarketsComplete(peekFootballObMarkets("m1"))).toBe(true);
    await loadFootballObMarkets("m1");
    expect(fetchObFootballMatchMarkets).toHaveBeenCalledTimes(1);
  });
});
