import type { AdminOrderRow } from "@/types/admin";
import { describe, expect, it } from "vitest";
import { buildAdminOrdersMatrix, buildLinkGroups, parseBetHandicapLabel, parseBetMapLabel } from "./adminOrdersMatrix";

function order(partial: Partial<AdminOrderRow> & Pick<AdminOrderRow, "id">): AdminOrderRow {
  return {
    userId: "u1",
    playerId: 1,
    orderId: `oid-${partial.id}`,
    linkId: 0,
    provider: "OB",
    match: "Team A vs Team B",
    bet: "[全场] 胜负",
    item: "Team A",
    odds: 1.9,
    betMoney: 100,
    money: 0,
    status: "pending",
    createAt: 1_700_000_000_000,
    ...partial,
  };
}

describe("buildAdminOrdersMatrix", () => {
  it("merges arb legs with same linkId into one cell even when matchKey differs", () => {
    const linkId = 1_735_000_000_123;
    const orders = [
      order({
        id: 1,
        linkId,
        provider: "OB",
        matchKey: "id:100",
        matchId: 100,
        matchLabel: "A vs B",
        item: "Team A",
      }),
      order({
        id: 2,
        linkId,
        provider: "RAY",
        matchKey: "t:A vs B",
        matchId: 0,
        matchLabel: "A  vs  B",
        item: "Team B",
        createAt: 1_700_000_000_100,
      }),
    ];

    const { matchGroups } = buildAdminOrdersMatrix(orders);
    expect(matchGroups).toHaveLength(1);
    expect(matchGroups[0].links).toHaveLength(1);
    const cell = matchGroups[0].links[0].cells.u1;
    expect(cell?.rows).toHaveLength(2);
    expect(cell?.isLinked).toBe(true);
    expect(cell?.linkId).toBe(linkId);
  });

  it("places same linkId on one matrix row across users", () => {
    const linkId = 1_735_000_000_456;
    const orders = [
      order({ id: 1, userId: "u1", linkId, provider: "OB" }),
      order({ id: 2, userId: "u2", linkId, provider: "RAY", createAt: 1_700_000_000_050 }),
    ];

    const { matchGroups } = buildAdminOrdersMatrix(orders);
    expect(matchGroups[0].links).toHaveLength(1);
    expect(matchGroups[0].links[0].cells.u1?.rows).toHaveLength(1);
    expect(matchGroups[0].links[0].cells.u2?.rows).toHaveLength(1);
    expect(matchGroups[0].links[0].cells.u1?.linkId).toBe(linkId);
    expect(matchGroups[0].links[0].cells.u2?.linkId).toBe(linkId);
  });
});

describe("buildLinkGroups", () => {
  it("groups rows by linkId", () => {
    const linkId = 1_735_000_000_789;
    const groups = buildLinkGroups([
      order({ id: 1, linkId }),
      order({ id: 2, linkId, provider: "RAY" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });
});

describe("parseBetMapLabel / parseBetHandicapLabel", () => {
  it("splits common bet prefixes", () => {
    expect(parseBetMapLabel("[全场] 胜负")).toBe("全场");
    expect(parseBetHandicapLabel("[全场] 胜负")).toBe("胜负");
    expect(parseBetMapLabel("[地图1] 获胜")).toBe("地图1");
    expect(parseBetHandicapLabel("[地图1] 获胜")).toBe("获胜");
    expect(parseBetMapLabel("[地图2]-单局-获胜")).toBe("地图2");
    expect(parseBetHandicapLabel("[地图2]-单局-获胜")).toBe("获胜");
  });

  it("fills map and handicap columns on matrix rows", () => {
    const orders = [
      order({ id: 1, bet: "[地图1] 获胜" }),
      order({ id: 2, userId: "u2", bet: "[地图1] 获胜", createAt: 1_700_000_000_050 }),
    ];
    const { matchGroups } = buildAdminOrdersMatrix(orders);
    expect(matchGroups[0].links[0].mapLabel).toBe("地图1");
    expect(matchGroups[0].links[0].handicapLabel).toBe("获胜");
  });
});
