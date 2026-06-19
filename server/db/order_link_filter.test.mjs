import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isHashLink,
  isOrderListVisible,
  isPbHashOrder,
} from "./order_link_filter.js";

describe("order_link_filter", () => {
  it("isHashLink detects placeholder links", () => {
    assert.equal(isHashLink(12345), true);
    assert.equal(isHashLink(1_000_000_000_001), false);
    assert.equal(isHashLink(-1), false);
  });

  it("isPbHashOrder only matches PB hash orders", () => {
    assert.equal(isPbHashOrder(12345, "PB"), true);
    assert.equal(isPbHashOrder(12345, "OB"), false);
    assert.equal(isPbHashOrder(1_000_000_000_001, "PB"), false);
  });

  it("isOrderListVisible returns true for all orders", () => {
    assert.equal(isOrderListVisible(1_000_000_000_001, "PB"), true);
    assert.equal(isOrderListVisible(12345, "OB"), true);
    assert.equal(isOrderListVisible(12345, "PB"), true);
    assert.equal(isOrderListVisible(-1, "RAY"), true);
  });
});
