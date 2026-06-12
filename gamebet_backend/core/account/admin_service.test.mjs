import { describe, expect, it } from "vitest";
import {
  profileSettingForAdmin,
  sanitizeAccountForAdmin,
  sanitizeSettingForAdmin,
} from "./admin_service.js";

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
});
