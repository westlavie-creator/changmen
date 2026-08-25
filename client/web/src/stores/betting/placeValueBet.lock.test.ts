import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

describe("placeValueBetOrder lock policy", () => {
  it("does not catch-retry placeValueBetOrderLocked after locks.request failure", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, "placeValueBet.ts"), "utf8");
    // Old bug: catch { return placeValueBetOrderLocked(params) } double-staked
    // when the lock callback threw after betting() already succeeded.
    expect(src).toMatch(/locks\.request\(PLACE_LOCK_NAME,\s*\(\)\s*=>\s*placeValueBetOrderLocked\(params\)\)/);
    expect(src).not.toMatch(/catch\s*\{[\s\S]*placeValueBetOrderLocked\(params\)/);
  });
});
