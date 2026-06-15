import { describe, expect, test } from "vitest";
import { parseStakeTabIdFromStore } from "./tabId";

describe("parseStakeTabIdFromStore", () => {
  test("reads tab id from plugin store shapes", () => {
    expect(parseStakeTabIdFromStore(42)).toBe(42);
    expect(parseStakeTabIdFromStore({ data: { Stake: 99 } })).toBe(99);
    expect(parseStakeTabIdFromStore({ response: { data: { Stake: 77 } } })).toBe(77);
    expect(parseStakeTabIdFromStore({ data: { OB: 1 } })).toBeUndefined();
  });
});
