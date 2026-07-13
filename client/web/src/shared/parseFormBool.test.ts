import { describe, expect, it } from "vitest";
import { parseFormBool } from "@/shared/parseFormBool";

describe("parseFormBool", () => {
  it("treats string false as off", () => {
    expect(parseFormBool("false")).toBe(false);
    expect(Boolean("false")).toBe(true);
  });

  it("treats 0 and 1 correctly", () => {
    expect(parseFormBool(0)).toBe(false);
    expect(parseFormBool(1)).toBe(true);
    expect(parseFormBool("0")).toBe(false);
    expect(parseFormBool("1")).toBe(true);
  });
});
