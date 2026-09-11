import { describe, expect, test } from "vitest";
import { isPbLiveTabDead, isPbTabMiss, parsePbTabIdFromStore, pbLiveTabHardError } from "./tabId";

describe("parsePbTabIdFromStore", () => {
  test("reads PB tab id from plugin store shapes", () => {
    expect(parsePbTabIdFromStore(42)).toBe(42);
    expect(parsePbTabIdFromStore({ data: { PB: 99 } })).toBe(99);
    expect(parsePbTabIdFromStore({ response: { data: { PB: 77 } } })).toBe(77);
    expect(parsePbTabIdFromStore({ data: { Stake: 1 } })).toBeUndefined();
  });
});

describe("isPbTabMiss", () => {
  test("detects closed tab errors", () => {
    expect(isPbTabMiss(new Error("标签页通信失败"))).toBe(true);
    expect(isPbTabMiss("Could not establish connection. Receiving end does not exist.")).toBe(true);
    expect(isPbTabMiss({ message: "Receiving end does not exist" })).toBe(true);
    expect(isPbTabMiss({ data: { success: true } })).toBe(false);
    expect(isPbTabMiss("Request failed with status code 403")).toBe(false);
    expect(isPbTabMiss(new Error("PB live tab host mismatch"))).toBe(true);
  });
});

describe("isPbLiveTabDead", () => {
  test("null / empty / miss fallback; axios payload stays live", () => {
    expect(isPbLiveTabDead(undefined)).toBe(true);
    expect(isPbLiveTabDead(null)).toBe(true);
    expect(isPbLiveTabDead({})).toBe(true);
    expect(isPbLiveTabDead("PB live tab host mismatch")).toBe(true);
    expect(isPbLiveTabDead({ data: { success: true } })).toBe(false);
    expect(isPbLiveTabDead("Request failed with status code 403")).toBe(false);
  });
});

describe("pbLiveTabHardError", () => {
  test("venue 403 string becomes Error; miss stays undefined", () => {
    expect(pbLiveTabHardError("Request failed with status code 403")?.message)
      .toBe("Request failed with status code 403");
    expect(pbLiveTabHardError("PB live tab host mismatch")).toBeUndefined();
    expect(pbLiveTabHardError({ data: { success: true } })).toBeUndefined();
  });
});
