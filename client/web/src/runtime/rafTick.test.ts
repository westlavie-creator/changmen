import { describe, expect, it } from "vitest";
import { createRafTicker, yieldToPaint } from "@/runtime/rafTick";

describe("createRafTicker", () => {
  it("collapses many schedule calls into one bump", async () => {
    const tick = createRafTicker();
    let n = 0;
    tick(() => { n += 1; });
    tick(() => { n += 1; });
    tick(() => { n += 1; });
    expect(n).toBe(0);
    await Promise.resolve();
    expect(n).toBe(1);
  });
});

describe("yieldToPaint", () => {
  it("resolves", async () => {
    await yieldToPaint();
  });
});
