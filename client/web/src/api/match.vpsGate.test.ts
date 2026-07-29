import { describe, expect, it, vi } from "vitest";
import { isVpsOwnedPlatformCollect } from "@changmen/venue-adapter/registry";
import { saveBetSource, saveLiveTimer, saveMatchSource } from "./match";

vi.mock("@/api/client", () => ({
  post: vi.fn(),
  postForm: vi.fn(async () => ({ success: 1 })),
  unwrap: vi.fn(),
}));

describe("api/match VPS Save* gate", () => {
  it("blocks Save* for every vps_http_ws platform from manifest", async () => {
    expect(isVpsOwnedPlatformCollect("PredictFun")).toBe(true);
    expect(isVpsOwnedPlatformCollect("Polymarket")).toBe(true);
    expect(await saveMatchSource("PredictFun", [])).toBe(false);
    expect(await saveMatchSource("Polymarket", [])).toBe(false);
    expect(await saveBetSource("PredictFun", "1", [])).toBe(false);
    expect(await saveBetSource("Polymarket", "1", [])).toBe(false);
    expect(await saveLiveTimer("PredictFun", [])).toBe(false);
    expect(await saveLiveTimer("Polymarket", [])).toBe(false);
  });

  it("allows classic browser Save* platforms through the gate", async () => {
    expect(isVpsOwnedPlatformCollect("OB")).toBe(false);
    expect(await saveMatchSource("OB", [])).toBe(true);
    expect(await saveBetSource("OB", "1", [])).toBe(true);
    expect(await saveLiveTimer("OB", [])).toBe(true);
  });
});
