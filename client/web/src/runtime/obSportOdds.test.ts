import { describe, expect, it } from "vitest";
import {
  dedupeObPlaySelectionRows,
  extractObPlaySelections,
  playsFromObMatchRow,
} from "@/runtime/obSportOdds";

describe("extractObPlaySelections moneyline", () => {
  it("keeps only the complete 1X2 line and drops draw-only extras", () => {
    const rows = extractObPlaySelections({
      hpid: "1",
      hpn: "全场独赢",
      hl: [
        {
          ol: [
            { on: "主胜", ov: 1.94, oid: "h" },
            { on: "和", ov: 3, oid: "d" },
            { on: "客胜", ov: 3.7, oid: "a" },
          ],
        },
        {
          ol: [{ on: "和", ov: 5.2, oid: "d2" }],
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.marketCode).toBe("moneyline");
    expect(rows[0]?.selections.map(s => s.side)).toEqual(["home", "draw", "away"]);
    expect(rows[0]?.selections.find(s => s.side === "draw")?.odds).toBe(3);
  });

  it("keeps European handicap 1X2 lines with hv", () => {
    const rows = extractObPlaySelections({
      hpid: "1",
      hpn: "全场独赢",
      hl: [
        {
          hv: "0",
          ol: [
            { on: "主胜", ov: 2.05, oid: "h" },
            { on: "和", ov: 3.4, oid: "d" },
            { on: "客胜", ov: 3.2, oid: "a" },
          ],
        },
        {
          hv: "-1",
          ol: [
            { on: "主胜", ov: 5.8, oid: "h2" },
            { on: "和", ov: 1.2, oid: "d2" },
            { on: "客胜", ov: 8.1, oid: "a2" },
          ],
        },
        {
          hv: "-2",
          ol: [
            { on: "主胜", ov: 5, oid: "h3" },
            { on: "和", ov: 1.28, oid: "d3" },
            { on: "客胜", ov: 6.9, oid: "a3" },
          ],
        },
      ],
    });
    expect(rows.map(r => r.line)).toEqual([0, -1, -2]);
    expect(rows.every(r => r.marketCode === "moneyline" && r.hpid === "1")).toBe(true);
    expect(rows[1]?.selections.find(s => s.side === "draw")?.odds).toBe(1.2);
  });
});

describe("dedupeObPlaySelectionRows", () => {
  it("drops hpsAdd duplicate of the same hid", () => {
    const play = {
      hpid: "1",
      hpn: "全场独赢",
      hl: {
        hid: "hid-even",
        ol: [
          { on: "主胜", ov: 2.05, oid: "h" },
          { on: "和", ov: 3.4, oid: "d" },
          { on: "客胜", ov: 3.2, oid: "a" },
        ],
      },
    };
    const add = { ...play, hlnm: 0 };
    const rows = dedupeObPlaySelectionRows(
      playsFromObMatchRow({ hpsData: [{ hps: [play], hpsAdd: [add] }] }).flatMap(extractObPlaySelections),
    );
    expect(rows).toHaveLength(1);
  });
});
