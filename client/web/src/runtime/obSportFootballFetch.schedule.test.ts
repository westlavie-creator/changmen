import { describe, expect, it } from "vitest";
import { buildObFootballListDto, collectObFootballSchedule } from "@/runtime/obSportFootballFetch";

describe("collectObFootballSchedule", () => {
  it("reads tournaments when PB unwraps to a top-level array", () => {
    const rows = collectObFootballSchedule({
      data: [
        { csid: "1", tid: "180", tn: "英超", mids: "1001,1002", mgt: 1_800_000_000_000 },
      ],
    });
    expect(rows.map(r => r.mid)).toEqual(["1001", "1002"]);
  });

  it("reads livedata / nolivedata bags and object maps", () => {
    const rows = collectObFootballSchedule({
      livedata: { t1: { csid: "1", tid: "180", mids: "9001", mgt: 1 } },
      nolivedata: [{ csid: "1", tid: "320", mids: "8001", mgt: 2 }],
    });
    const live = rows.find(r => r.mid === "9001");
    const pre = rows.find(r => r.mid === "8001");
    expect(live?.isLive).toBe(true);
    expect(pre?.isLive).toBe(false);
  });

  it("marks live-menu rows even when only data[] is present", () => {
    const rows = collectObFootballSchedule({
      data: [{ csid: "1", tid: "1", mids: "7701", mgt: 3 }],
    }, true);
    expect(rows).toEqual([expect.objectContaining({ mid: "7701", isLive: true })]);
  });

  it("drops 19-digit schedule-bag ids and keeps trial-like nested matches", () => {
    const rows = collectObFootballSchedule({
      data: [{
        csid: "1",
        tid: "180",
        tn: "英格兰超级联赛",
        tnjc: "英超",
        mids: "2097200625505820674,5652292",
        mls: [{
          mid: "5652292",
          mhn: "阿森纳",
          man: "切尔西",
          mgt: 1_800_000_000_000,
        }],
      }],
    });
    expect(rows.map(r => r.mid)).toEqual(["5652292"]);
    expect(rows[0]).toMatchObject({ home: "阿森纳", away: "切尔西", tnjc: "英超" });
  });
});

describe("buildObFootballListDto", () => {
  const meta = {
    mid: "5652292",
    tid: "180",
    tn: "英格兰超级联赛",
    tnjc: "英超",
    startTime: 1_800_000_000_000,
    home: "阿森纳",
    away: "切尔西",
  };

  it("keeps the match when odds HTTP is missing", () => {
    const dto = buildObFootballListDto(meta);
    expect(dto?.Title).toBe("阿森纳 vs 切尔西");
    expect(dto?.Game).toBe("英超");
    expect(dto?.Matchs).toEqual({ OB: "5652292" });
    expect(dto?.Bets).toEqual([]);
  });

  it("keeps the match when only moneyline is present", () => {
    const dto = buildObFootballListDto(meta, {
      mhn: "阿森纳",
      man: "切尔西",
      playData: [{
        hpid: "1",
        hpn: "全场独赢",
        hl: [{
          ol: [
            { on: "主胜", ov: 1.94, oid: "h" },
            { on: "和", ov: 3, oid: "d" },
            { on: "客胜", ov: 3.7, oid: "a" },
          ],
        }],
      }],
    });
    expect(dto?.Title).toBe("阿森纳 vs 切尔西");
    expect(dto?.Bets).toEqual([]);
  });

  it("still only lists 让球/大小 on the card", () => {
    const dto = buildObFootballListDto(meta, {
      mhn: "阿森纳",
      man: "切尔西",
      playData: [{
        hpid: "4",
        hpn: "全场让球",
        hl: [{
          hv: "-0.5",
          ol: [
            { on: "主", ov: 1.9, oid: "h" },
            { on: "客", ov: 1.85, oid: "a" },
          ],
        }],
      }],
    });
    expect(dto?.Bets?.map(b => b.MarketCode)).toEqual(["spreads"]);
  });
});
