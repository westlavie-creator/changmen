import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  ARB_LINK_MIN,
  backendBindLinkFromCreateAt,
  CLIENT_ORDER_LIST_SQL,
  isArbBindLink,
  isClientOrderListVisible,
  isCreateAtPlaceholderLink,
  isHashLink,
  isInsertTimePlaceholderLink,
  isOrderListVisible,
  isPbHashOrder,
  orderVisibleSqlAnd,
  placeholderLinkFromCreateAt,
  placeholderLinkFromInsertAt,
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

  it("orderVisibleSqlAnd appends link filter", () => {
    assert.equal(orderVisibleSqlAnd("user_id = $1"), "user_id = $1 AND link < create_at");
    assert.equal(orderVisibleSqlAnd(""), "link < create_at");
  });

  it("isClientOrderListVisible uses link < create_at", () => {
    const ca = 1_781_890_412_000;
    assert.equal(isClientOrderListVisible(1_781_890_411_000, ca), true);
    assert.equal(isClientOrderListVisible(ca + 50_000, ca), false);
    assert.equal(isClientOrderListVisible(-ca, ca), true);
    assert.equal(CLIENT_ORDER_LIST_SQL, "link < create_at");
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

  it("backendBindLinkFromCreateAt is before create_at", () => {
    const ca = 1_781_882_462_790;
    assert.equal(backendBindLinkFromCreateAt(ca), ca - 1);
    assert.ok(backendBindLinkFromCreateAt(ca) < ca);
  });

  it("placeholderLinkFromInsertAt uses insert ms", () => {
    assert.equal(placeholderLinkFromInsertAt(1_781_900_000_000), 1_781_900_000_000);
    assert.ok(placeholderLinkFromInsertAt(0) >= ARB_LINK_MIN);
  });

  it("isInsertTimePlaceholderLink requires link after create_at", () => {
    const ca = 1_781_882_462_790;
    assert.equal(isInsertTimePlaceholderLink(ca + 50_000, ca), true);
    assert.equal(isInsertTimePlaceholderLink(ca, ca), false);
    assert.equal(isInsertTimePlaceholderLink(ca - 1, ca), false);
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
      shouldFireOrderBoundHook({ link: ca + 60_000, create_at: ca }, arb),
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
