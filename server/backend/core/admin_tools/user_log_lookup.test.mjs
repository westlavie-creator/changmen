import { describe, expect, it } from "vitest";
import {
  buildLegSections,
  buildLogSegments,
  buildOrderSections,
  buildPlatformSections,
  computeLogWindow,
  extractLogAccountLabel,
  extractLogOrderId,
  extractLogProvider,
  extractLogTarget,
  groupMetaLabel,
  linkTypeLabel,
  summarizeUserLog,
  toAdminOrderLogPayload,
} from "./user_log_lookup.js";

describe("user_log_lookup", () => {
  it("linkTypeLabel and groupMetaLabel", () => {
    expect(linkTypeLabel(1_781_802_360_547)).toBe("套利");
    expect(linkTypeLabel(-1)).toBe("单边");
    expect(linkTypeLabel(12345)).toBe("外部");
    expect(groupMetaLabel(1_781_802_360_547, 1)).toBe("单笔");
    expect(groupMetaLabel(1_781_802_360_547, 2)).toBe("套利 2 笔");
  });

  it("computeLogWindow spans orders and arb link timestamp", () => {
    const linkTs = 1_781_802_360_547;
    const orders = [
      { create_at: linkTs + 900, link: linkTs },
      { create_at: linkTs + 1400, link: linkTs },
    ];
    const w = computeLogWindow(orders, 60_000);
    expect(w.fromMs).toBe(linkTs - 60_000);
    expect(w.toMs).toBe(linkTs + 1400 + 60_000);
  });

  it("summarizeUserLog extracts bet failure message", () => {
    const row = {
      id: 1,
      create_at: 1,
      title: "[RAY](雷,6) 下注 => false / 耗时:869ms",
      data: JSON.stringify({
        result: {
          provider: "RAY",
          success: false,
          message: "赔率下降至1.87",
        },
      }),
    };
    const s = summarizeUserLog(row);
    expect(s.kind).toBe("bet");
    expect(s.provider).toBe("RAY");
    expect(s.summary).toContain("失败");
    expect(s.summary).toContain("赔率下降至1.87");
  });

  it("buildPlatformSections groups orders and logs by provider", () => {
    const orders = [
      { orderId: "o1", provider: "OB", createAt: 100 },
      { orderId: "o2", provider: "RAY", createAt: 200 },
    ];
    const logs = [
      { provider: "OB", createAt: 50, kind: "check", summary: "ob check" },
      { provider: "RAY", createAt: 60, kind: "bet", summary: "ray bet" },
      { provider: "RAY", createAt: 70, kind: "bet", summary: "ray retry" },
    ];
    const sections = buildPlatformSections(orders, logs);
    expect(sections).toHaveLength(2);
    expect(sections[0].label).toBe("OB");
    expect(sections[0].orders).toHaveLength(1);
    expect(sections[0].logs).toHaveLength(1);
    expect(sections[1].label).toBe("RAY");
    expect(sections[1].logs.map((l) => l.createAt)).toEqual([60, 70]);
  });

  it("extractLogProvider reads bracket title", () => {
    expect(extractLogProvider("[PB] - x 拒单", null, "reject")).toBe("PB");
  });

  it("buildOrderSections groups logs per order and orphan attempts", () => {
    const orders = [
      { orderId: "o-ob", provider: "OB", createAt: 100, status: "Win" },
    ];
    const logs = [
      { provider: "OB", createAt: 50, kind: "check", summary: "ob check" },
      { provider: "OB", orderId: "o-ob", createAt: 90, kind: "bet", summary: "ob bet" },
      { provider: "RAY", createAt: 60, kind: "bet", summary: "ray fail" },
      { provider: "RAY", createAt: 70, kind: "bet", summary: "ray retry" },
    ];
    const sections = buildOrderSections(orders, logs);
    expect(sections).toHaveLength(2);
    expect(sections[0].order?.orderId).toBe("o-ob");
    expect(sections[0].logs).toHaveLength(2);
    expect(sections[1].order).toBeNull();
    expect(sections[1].label).toContain("RAY");
    expect(sections[1].logs).toHaveLength(2);
  });

  it("extractLogOrderId reads bet result and reject title", () => {
    expect(
      extractLogOrderId(
        "[OB] 下注 => true",
        { result: { orderId: "abc123" } },
        "bet",
      ),
    ).toBe("abc123");
    expect(extractLogOrderId("[PB] - oid9 拒单检测 => x", null, "reject")).toBe("oid9");
  });

  it("buildLegSections groups arb by home/away with retry attempts", () => {
    const orders = [
      { orderId: "o-ob", provider: "OB", createAt: 100, status: "Win", link: 1_000_000_000_001 },
      { orderId: "o-ray1", provider: "RAY", createAt: 200, status: "Reject", link: 1_000_000_000_001 },
      { orderId: "o-ray2", provider: "RAY", createAt: 400, status: "Win", link: 1_000_000_000_001 },
    ];
    const logs = [
      { provider: "OB", target: "Home", orderId: "o-ob", createAt: 90, kind: "bet", summary: "ob" },
      {
        provider: "RAY",
        target: "Away",
        orderId: "o-ray1",
        createAt: 180,
        kind: "bet",
        summary: "ray1",
      },
      { provider: "RAY", target: "Away", createAt: 250, kind: "reject", summary: "拒单" },
      { provider: "RAY", target: "Away", orderId: "o-ray2", createAt: 380, kind: "bet", summary: "ray2" },
    ];
    const legs = buildLegSections(orders, logs, { linkType: "套利", groupLabel: "套利 3 笔" });
    expect(legs).toHaveLength(2);
    expect(legs[0].side).toBe("Home");
    expect(legs[0].label).toBe("主队");
    expect(legs[0].attempts).toHaveLength(1);
    expect(legs[1].side).toBe("Away");
    expect(legs[1].label).toBe("客队");
    expect(legs[1].attempts).toHaveLength(2);
    expect(legs[1].attempts[0].order?.orderId).toBe("o-ray1");
    expect(legs[1].attempts[1].order?.orderId).toBe("o-ray2");
    expect(legs[0].attempts[0].logSegments?.length).toBeGreaterThan(0);
  });

  it("extractLogTarget reads check options", () => {
    expect(
      extractLogTarget({ options: { target: "Away" } }, "check", ""),
    ).toBe("Away");
    expect(extractLogTarget(null, "bet", "RAY 预检 xxx Away@2.1 金额100")).toBe("Away");
  });

  it("extractLogAccountLabel parses title bracket", () => {
    const acct = extractLogAccountLabel("[OB](星空,4) 请求盘口数据 => true");
    expect(acct?.label).toBe("OB · 星空 / 4");
    expect(acct?.provider).toBe("OB");
  });

  it("buildLogSegments splits on each check (makeup rounds)", () => {
    const logs = [
      {
        id: 1,
        kind: "check",
        createAt: 100,
        title: "[OB](星空,4) 请求盘口",
        provider: "OB",
        loseOrder: true,
        accountLabel: "OB · 星空 / 4",
      },
      { id: 2, kind: "bet", createAt: 110, title: "[OB](星空,4) 下注 => false", provider: "OB" },
      {
        id: 3,
        kind: "check",
        createAt: 200,
        title: "[OB](开云,1) 请求盘口",
        provider: "OB",
        loseOrder: true,
        accountLabel: "OB · 开云 / 1",
      },
      { id: 4, kind: "bet", createAt: 210, title: "[OB](开云,1) 下注 => true", provider: "OB" },
    ];
    const segs = buildLogSegments(logs);
    expect(segs).toHaveLength(2);
    expect(segs[0].accountLabel).toContain("星空");
    expect(segs[0].isMakeUp).toBe(true);
    expect(segs[0].logs).toHaveLength(2);
    expect(segs[1].accountLabel).toContain("开云");
    expect(segs[1].logs).toHaveLength(2);
  });

  it("toAdminOrderLogPayload strips logsRaw and includes legSections", () => {
    const payload = toAdminOrderLogPayload({
      ok: true,
      user: { id: "u1", userName: "gb12" },
      anchor: { type: "link", value: 1 },
      link: 1,
      linkType: "套利",
      groupLabel: "套利 2 笔",
      logWindow: { fromMs: 1, toMs: 2 },
      orders: [
        { orderId: "1", provider: "OB", createAt: 1, link: 1_000_000_000_001 },
        { orderId: "2", provider: "RAY", createAt: 2, link: 1_000_000_000_001 },
      ],
      logs: [{ provider: "OB", target: "Home", createAt: 1, kind: "check", summary: "Home@2" }],
      logsRaw: [{ id: 9 }],
    });
    expect(payload.ok).toBe(true);
    expect(payload.logsRaw).toBeUndefined();
    expect(payload.legSections).toHaveLength(2);
    expect(payload.legSections[0].label).toBe("主队");
  });
});
