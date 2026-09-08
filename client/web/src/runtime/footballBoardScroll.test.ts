import { describe, expect, it } from "vitest";
import { applyVerticalWheel } from "@/runtime/footballBoardScroll";

function scroller(scrollHeight: number, clientHeight: number, scrollTop: number) {
  return {
    scrollHeight,
    clientHeight,
    scrollTop,
  } as HTMLElement;
}

describe("footballBoardScroll", () => {
  it("moves scrollTop when the scroller can move", () => {
    const el = scroller(400, 100, 0);
    expect(applyVerticalWheel(el, 50)).toBe(true);
    expect(el.scrollTop).toBe(50);
  });

  it("does not move when already at the end", () => {
    const el = scroller(400, 100, 300);
    expect(applyVerticalWheel(el, 40)).toBe(false);
    expect(el.scrollTop).toBe(300);
  });
});
