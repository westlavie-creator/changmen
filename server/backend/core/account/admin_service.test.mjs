import { describe, expect, it, vi } from "vitest";

vi.mock("@changmen/db", () => ({
  fetchOrdersAdminPage: vi.fn(async () => ({
    rows: [
      { id: 1, user_id: "u1", order_id: "o1", link: 0, create_at: 1, raw: {} },
      { id: 2, user_id: "u1", order_id: "o2", link: 0, create_at: 2, raw: {} },
    ],
    total: 2,
  })),
  ensurePgPoolReady: vi.fn(async () => {}),
  getPgPool: vi.fn(() => ({
    query: vi.fn(async (sql, params) => {
      const q = String(sql);
      if (q.includes("FROM users WHERE id = $1")) {
        return { rows: [{ user_name: "alice" }] };
      }
      if (q.includes("lower(user_name) = lower($1) AND id <> $2")) {
        return { rows: params[0] === "bob" ? [{ id: "other" }] : [] };
      }
      return { rows: [] };
    }),
  })),
  updateUserName: vi.fn(async () => true),
}));

vi.mock("../db/store.js", () => ({
  loadProfileById: vi.fn(async () => null),
}));

import {
  listAdminOrders,
  profileSettingForAdmin,
  renameAdminUser,
  sanitizeAccountForAdmin,
  sanitizeSettingForAdmin,
} from "./admin_service.js";
import { lastLoginFieldsFromProfile } from "./user_login_meta.js";

describe("listAdminOrders", () => {
  it("maps multiple rows without treating array index as startIndex", async () => {
    const page = await listAdminOrders({ date: "2026-06-13", pageIndex: 1, pageSize: 50 });
    expect(page.list).toHaveLength(2);
    expect(page.list[0].id).toBe(1);
    expect(page.list[1].id).toBe(2);
  });
});

describe("sanitizeAccountForAdmin", () => {
  it("strips token and cookie but keeps betting fields", () => {
    const row = sanitizeAccountForAdmin({
      accountId: 12,
      platform: "OB",
      playerName: "tester",
      token: "secret-token",
      cookie: "secret-cookie",
      balance: 1000,
      minOdds: 1.3,
      maxOdds: 5,
      profit: 1.03,
      game: { LOL: { betCount: 2, profit: 1.05, odds: ["1.9"] } },
      gateway: "https://api.example.com/v1",
    });
    expect(row.hasCredentials).toBe(true);
    expect(row.token).toBeUndefined();
    expect(row.cookie).toBeUndefined();
    expect(row.balance).toBe(1000);
    expect(row.gatewayHost).toBe("api.example.com");
    expect(row.game.LOL.betCount).toBe(2);
  });
});

describe("sanitizeSettingForAdmin", () => {
  it("returns setting object copy", () => {
    const s = sanitizeSettingForAdmin({ betting: true, betMoney: 100 });
    expect(s).toEqual({ betting: true, betMoney: 100 });
  });
});

describe("profileSettingForAdmin", () => {
  it("merges betting_config, collect_config and preferences", () => {
    const s = profileSettingForAdmin({
      betting_config: { betting: true, betMoney: 200 },
      collect_config: { OB: true, RAY: false },
      preferences: { Follow: "on" },
    });
    expect(s.betting).toBe(true);
    expect(s.betMoney).toBe(200);
    expect(s.Follow).toBe("on");
    expect(s.CollectConfig).toEqual({ OB: true, RAY: false });
  });

  it("hides system preference keys from admin setting view", () => {
    const s = profileSettingForAdmin({
      betting_config: { betMoney: 100 },
      preferences: { lastLoginIp: "1.2.3.4", lastLoginAt: 1, Follow: "on" },
    });
    expect(s.lastLoginIp).toBeUndefined();
    expect(s.Follow).toBe("on");
  });
});

describe("lastLoginFieldsFromProfile", () => {
  it("reads last login ip and time from preferences", () => {
    expect(
      lastLoginFieldsFromProfile({
        preferences: { lastLoginIp: "203.0.113.1", lastLoginAt: 1700000000000 },
      }),
    ).toEqual({ lastLoginIp: "203.0.113.1", lastLoginAt: 1700000000000 });
  });
});

describe("renameAdminUser", () => {
  it("rejects empty user name", async () => {
    await expect(renameAdminUser("u1", "  ")).rejects.toThrow("用户名必填");
  });

  it("rejects duplicate user name", async () => {
    await expect(renameAdminUser("u1", "bob")).rejects.toThrow("用户名已存在");
  });

  it("renames user when name is available", async () => {
    const result = await renameAdminUser("u1", "carol");
    expect(result).toEqual({ id: "u1", userName: "carol" });
  });
});
