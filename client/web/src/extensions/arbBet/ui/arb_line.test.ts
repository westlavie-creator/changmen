import { describe, expect, it } from "vitest";
import { centerInContainer, computeArbLineOverlay } from "@/extensions/arbBet/ui/arb_line";

describe("computeArbLineOverlay", () => {
  it("returns line and badge in container coordinates", () => {
    const container = {
      getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 } as DOMRect),
    } as HTMLElement;
    const home = {
      getBoundingClientRect: () => ({ left: 120, top: 80, width: 40, height: 20 } as DOMRect),
    } as HTMLElement;
    const away = {
      getBoundingClientRect: () => ({ left: 300, top: 80, width: 40, height: 20 } as DOMRect),
    } as HTMLElement;

    const geom = computeArbLineOverlay(container, home, away);
    expect(geom).not.toBeNull();
    expect(geom!.line).toEqual({ x1: 40, y1: 40, x2: 220, y2: 40 });
    expect(geom!.badge).toEqual({ x: 130, y: 26 });
  });

  it("returns null when an anchor is missing", () => {
    const container = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 } as DOMRect),
    } as HTMLElement;
    expect(computeArbLineOverlay(container, null, null)).toBeNull();
  });
});

describe("centerInContainer", () => {
  it("uses element center relative to container origin", () => {
    const el = {
      getBoundingClientRect: () => ({ left: 110, top: 60, width: 20, height: 10 } as DOMRect),
    } as HTMLElement;
    const pt = centerInContainer(el, { left: 100, top: 50 } as DOMRect);
    expect(pt).toEqual({ x: 20, y: 15 });
  });
});
