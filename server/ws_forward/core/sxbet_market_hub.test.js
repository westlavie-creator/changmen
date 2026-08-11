import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseSxBetClientControl } from "./sxbet_market_hub.js";

describe("sxbet_market_hub control parse", () => {
  it("parses subscribe marketHashes object", () => {
    const ctrl = parseSxBetClientControl(JSON.stringify({
      method: "subscribe",
      params: { marketHashes: ["0xabc", ""] },
    }));
    assert.deepEqual(ctrl, { kind: "subscribe", marketHashes: ["0xabc"] });
  });

  it("parses ping", () => {
    assert.deepEqual(parseSxBetClientControl('{"method":"ping"}'), { kind: "ping" });
  });

  it("rejects garbage", () => {
    assert.equal(parseSxBetClientControl("nope"), null);
  });
});
