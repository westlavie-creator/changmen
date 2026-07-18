import { describe, expect, it } from "vitest";
import { browserSaveMatchPlatformIds, getPlatformMeta } from "./meta";

describe("browserSaveMatchPlatformIds", () => {
  it("excludes VPS index platforms (Polymarket, PredictFun)", () => {
    const ids = browserSaveMatchPlatformIds();
    expect(ids).not.toContain("Polymarket");
    expect(ids).not.toContain("PredictFun");
    expect(getPlatformMeta("Polymarket")?.collectionMode).toBe("vps_http_ws");
    expect(getPlatformMeta("PredictFun")?.collectionMode).toBe("vps_http_ws");
  });

  it("still includes classic browser Save* platforms", () => {
    const ids = browserSaveMatchPlatformIds();
    expect(ids).toContain("OB");
  });
});
