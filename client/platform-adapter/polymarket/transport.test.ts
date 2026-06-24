import { beforeEach, describe, expect, test, vi } from "vitest";
import { POLYMARKET_PLUGIN_REQUIRED_MSG, polymarketPluginGet } from "./transport";

vi.mock("@/chrome-plugin/bridge", () => ({
  hasA8PluginRuntime: vi.fn(() => true),
  a8PluginGet: vi.fn(),
}));

import { a8PluginGet, hasA8PluginRuntime } from "@/chrome-plugin/bridge";

describe("polymarket transport", () => {
  beforeEach(() => {
    vi.mocked(hasA8PluginRuntime).mockReturnValue(true);
    vi.mocked(a8PluginGet).mockReset();
  });

  test("无扩展时抛错", async () => {
    vi.mocked(hasA8PluginRuntime).mockReturnValue(false);
    await expect(polymarketPluginGet("https://gamma-api.polymarket.com/events")).rejects.toThrow(
      POLYMARKET_PLUGIN_REQUIRED_MSG,
    );
  });

  test("unwrap axios response.data", async () => {
    vi.mocked(a8PluginGet).mockResolvedValue({ status: 200, data: [{ id: "e1" }] });
    const rows = await polymarketPluginGet<Array<{ id: string }>>("https://gamma-api.polymarket.com/events");
    expect(rows).toEqual([{ id: "e1" }]);
    expect(a8PluginGet).toHaveBeenCalledWith(
      "https://gamma-api.polymarket.com/events",
      { timeout: 60_000 },
    );
  });

  test("HTTP 4xx 抛错", async () => {
    vi.mocked(a8PluginGet).mockResolvedValue({ status: 429, data: "rate limited" });
    await expect(polymarketPluginGet("https://gamma-api.polymarket.com/events")).rejects.toThrow("rate limited");
  });
});
