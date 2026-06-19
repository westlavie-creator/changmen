import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isArbBindLink,
  isCreateAtPlaceholderLink,
  isHashLink,
  isOrderListVisible,
  isPbHashOrder,
  placeholderLinkFromCreateAt,
  shouldFireOrderBoundHook,
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

  it("isOrderListVisible matches A8 JS helper (not SQL)", () => {
    assert.equal(isOrderListVisible(1_000_000_000_001, "PB"), true);
    assert.equal(isOrderListVisible(12345, "OB"), true);
    assert.equal(isOrderListVisible(12345, "PB"), false);
    assert.equal(isOrderListVisible(-1, "RAY"), true);
  });

  it("placeholderLinkFromCreateAt uses create_at ms", () => {
    assert.equal(placeholderLinkFromCreateAt(1_781_882_462_790), 1_781_882_462_790);
    assert.equal(placeholderLinkFromCreateAt(0, 99), 99);
    assert.equal(placeholderLinkFromCreateAt("bad", 42), 42);
  });

  it("isCreateAtPlaceholderLink matches link === create_at", () => {
    const ca = 1_781_882_462_790;
    assert.equal(isCreateAtPlaceholderLink(ca, ca), true);
    assert.equal(isCreateAtPlaceholderLink(ca + 1, ca), false);
    assert.equal(isCreateAtPlaceholderLink(12345, ca), false);
  });

  it("shouldFireOrderBoundHook covers hash and create_at placeholders", () => {
    const arb = 1_700_000_000_123;
    assert.equal(
      shouldFireOrderBoundHook({ link: 12345, create_at: 1 }, arb),
      true,
    );
    const ca = 1_781_882_462_790;
    assert.equal(
      shouldFireOrderBoundHook({ link: ca, create_at: ca }, arb),
      true,
    );
    assert.equal(
      shouldFireOrderBoundHook({ link: arb, create_at: ca }, arb + 1),
      false,
    );
    assert.equal(shouldFireOrderBoundHook({ link: 12345 }, 99999), false);
  });

  it("isArbBindLink requires ms-scale link", () => {
    assert.equal(isArbBindLink(1_000_000_000_001), true);
    assert.equal(isArbBindLink(12345), false);
  });
});
