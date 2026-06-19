import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./telegram.js", () => ({
  isAdminNotifyEnabled: vi.fn(() => true),
  sendAdminNotify: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@changmen/db", () => ({
  fetchProfileById: vi.fn(async () => ({
    user_name: "alice",
    accounts: [{ accountId: 12, platformName: "OB", playerName: "tester" }],
  })),
}));

import {
  formatAdminOrderTelegramBody,
  isExternalLink,
  linkTypeLabel,
  notifyNewOrdersFromRows,
  shouldNotifyAdminOrder,
  shouldNotifyOrderCreateAt,
} from "./order_notify.js";
import { sendAdminNotify } from "./telegram.js";

describe("admin_tools/order_notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("linkTypeLabel classifies link ids", () => {
    expect(linkTypeLabel(1_000_000_000_000)).toBe("套利");
    expect(linkTypeLabel(-1)).toBe("单边");
    expect(linkTypeLabel(12345)).toBe("hash");
  });

  it("shouldNotifyOrderCreateAt respects max age window", () => {
    const now = Date.parse("2026-06-18T12:00:00");
    expect(shouldNotifyOrderCreateAt(now - 30 * 60 * 1000, now)).toBe(true);
    expect(shouldNotifyOrderCreateAt(now - 3 * 60 * 60 * 1000, now)).toBe(false);
  });

  it("shouldNotifyAdminOrder skips external links", () => {
    const now = Date.parse("2026-06-18T12:00:00");
    const recent = now - 5 * 60 * 1000;
    expect(isExternalLink(12345)).toBe(true);
    expect(shouldNotifyAdminOrder(12345, recent, now)).toBe(false);
    expect(shouldNotifyAdminOrder(1_000_000_000_001, recent, now)).toBe(true);
    expect(shouldNotifyAdminOrder(-1, recent, now)).toBe(true);
  });

  it("formatAdminOrderTelegramBody strips html from match fields", () => {
    const body = formatAdminOrderTelegramBody({
      userName: "alice",
      playerLabel: "OB/tester",
      order: {
        provider: "OB",
        match: "<b>Team A vs B</b>",
        bet: "全场",
        item: "主",
        bet_money: 100,
        odds: 1.9,
        money: 0,
        status: "Pending",
        link: 1_000_000_000_001,
        order_id: "oid-1",
      },
    });
    expect(body).toContain("alice");
    expect(body).toContain("Team A vs B");
    expect(body).not.toContain("<b>Team");
    expect(body).toContain("套利");
    expect(body).toContain("LinkID：1000000000001");
  });

  it("notifyNewOrdersFromRows sends one message per qualifying row", async () => {
    await notifyNewOrdersFromRows([
      {
        user_id: "u1",
        player_id: 12,
        order_id: "o1",
        provider: "OB",
        match: "A vs B",
        bet: "map1",
        item: "主",
        bet_money: 50,
        odds: 2,
        money: 0,
        status: "Pending",
        link: 1_000_000_000_001,
        create_at: Date.now() - 60_000,
      },
    ]);
    expect(sendAdminNotify).toHaveBeenCalledTimes(1);
  });

  it("notifyNewOrdersFromRows skips external links", async () => {
    await notifyNewOrdersFromRows([
      {
        user_id: "u1",
        player_id: 12,
        order_id: "o2",
        provider: "OB",
        match: "A vs B",
        bet: "map1",
        item: "主",
        bet_money: 50,
        odds: 2,
        money: 0,
        status: "Pending",
        link: 99,
        create_at: Date.now() - 60_000,
      },
    ]);
    expect(sendAdminNotify).not.toHaveBeenCalled();
  });
});
