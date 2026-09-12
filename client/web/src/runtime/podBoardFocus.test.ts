import { describe, expect, it } from "vitest";
import {
  buildPodBoardFocus,
  podBoardBlockSelector,
  podBoardFocusMatchKey,
  podBoardLineAttr,
  podBoardMatchSelector,
  podBoardObSideSelector,
  podBoardOidSelector,
} from "@/runtime/podBoardFocus";

describe("podBoardFocus", () => {
  it("keys the board match the same way as the list (OB mid first)", () => {
    expect(podBoardFocusMatchKey({ matchId: 9, obMid: "5652292" })).toBe("ob:5652292");
    expect(podBoardFocusMatchKey({ id: 9, providers: { OB: "5652292" } })).toBe("ob:5652292");
    expect(podBoardFocusMatchKey({ matchId: 9, obMid: "" })).toBe("id:9");
    expect(podBoardMatchSelector({ matchId: 9, obMid: "5652292" })).toBe('[data-pod-match="ob:5652292"]');
  });

  it("keeps a 0 spread line and blanks an empty ML line", () => {
    expect(podBoardLineAttr(0)).toBe("0");
    expect(podBoardLineAttr(-0.5)).toBe("-0.5");
    expect(podBoardLineAttr(null)).toBe("");
  });

  it("builds a match-only target when the market is not matched", () => {
    const row = buildPodBoardFocus(
      { id: 9, obMid: "5652292" },
      { status: "none", marketCode: "totals", side: "over", line: 2.5, boardLine: 2.5, boardSide: "over", oid: "oid-x" },
    );
    expect(row.obMid).toBe("5652292");
    expect(row.oid).toBe("");
    expect(row.marketCode).toBe("");
  });

  it("prefers oid, then OB venue + side on the same line", () => {
    expect(podBoardOidSelector("oid-over")).toBe('[data-odd-id="oid-over"]');
    expect(podBoardBlockSelector("totals", 2.5)).toBe('[data-pod-market="totals"][data-pod-line="2.5"]');
    expect(podBoardObSideSelector("over")).toBe('[data-pod-venue="OB"][data-pod-side="over"]');
    expect(podBoardBlockSelector("spreads", 0)).toBe('[data-pod-market="spreads"][data-pod-line="0"]');
    expect(podBoardBlockSelector("moneyline", null)).toBe('[data-pod-market="moneyline"][data-pod-line=""]');
  });

  it("uses the board home-centric line and flipped side for jump fallback", () => {
    const away = {
      status: "matched" as const,
      marketCode: "spreads",
      side: "away" as const,
      line: 0.5,
      boardLine: -0.5,
      boardSide: "away" as const,
      oid: "",
    };
    const row = buildPodBoardFocus({ id: 9, obMid: "5652292" }, away);
    expect(row.line).toBe(-0.5);
    expect(row.side).toBe("away");
    expect(podBoardBlockSelector(row.marketCode, row.line)).toBe('[data-pod-market="spreads"][data-pod-line="-0.5"]');
  });
});
