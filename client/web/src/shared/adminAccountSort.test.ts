import { describe, expect, test } from "vitest";
import { compareAdminAccountKeys } from "@/shared/adminAccountSort";

function sorted(keys: Parameters<typeof compareAdminAccountKeys>[0][]) {
  return [...keys].sort(compareAdminAccountKeys);
}

describe("compareAdminAccountKeys", () => {
  test("orders by userName first", () => {
    const result = sorted([
      { userName: "GB14", provider: "九游", playerName: "甲", playerId: 1 },
      { userName: "GB12", provider: "雷竞技", playerName: "乙", playerId: 2 },
    ]);
    expect(result.map(k => k.userName)).toEqual(["GB12", "GB14"]);
  });

  test("orders by provider before account name within the same user", () => {
    const result = sorted([
      { userName: "GB12", provider: "PM", playerName: "甲", playerId: 1 },
      { userName: "GB12", provider: "OB", playerName: "乙", playerId: 2 },
    ]);
    expect(result.map(k => k.provider)).toEqual(["OB", "PM"]);
  });

  test("orders account names by zh-CN pinyin, not codepoint", () => {
    const result = sorted([
      { userName: "GB12", provider: "OB", playerName: "张三", playerId: 1 },
      { userName: "GB12", provider: "OB", playerName: "李四", playerId: 2 },
    ]);
    expect(result.map(k => k.playerName)).toEqual(["李四", "张三"]);
  });

  test("orders playerId numerically when user, provider and name tie", () => {
    const result = sorted([
      { userName: "GB12", provider: "OB", playerName: "甲", playerId: 10 },
      { userName: "GB12", provider: "OB", playerName: "甲", playerId: 2 },
    ]);
    expect(result.map(k => k.playerId)).toEqual([2, 10]);
  });

  test("empty account name sorts first within user, ties broken by numeric playerId", () => {
    const result = sorted([
      { userName: "GB12", provider: "OB", playerName: "甲", playerId: 1 },
      { userName: "GB12", provider: "OB", playerName: "", playerId: 5 },
      { userName: "GB12", provider: "OB", playerName: "", playerId: 3 },
    ]);
    expect(result.map(k => k.playerId)).toEqual([3, 5, 1]);
  });
});
