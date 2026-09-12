import { describe, expect, it } from "vitest";

import {
  UNGROUPED_TEAM_ID,
  filterUserIdsByTeam,
  resolveAdminMonthReportScope,
  resolveVisibleUserIds,
} from "./role_filter.js";

const profiles = [
  { id: "a1", team_id: "t-alpha", role: "admin", is_admin: true },
  { id: "l1", team_id: "t-alpha", role: "leader" },
  { id: "m1", team_id: "t-alpha", role: "user" },
  { id: "m2", team_id: "t-beta", role: "user" },
  { id: "m3", team_id: null, role: "user" },
];

describe("resolveVisibleUserIds", () => {
  it("admin sees everyone (null)", () => {
    expect(resolveVisibleUserIds({ id: "a1", role: "admin" }, profiles)).toBeNull();
  });

  it("leader sees only own team", () => {
    const ids = resolveVisibleUserIds({ id: "l1", role: "leader", teamId: "t-alpha" }, profiles);
    expect([...ids].sort()).toEqual(["a1", "l1", "m1"]);
  });
});

describe("filterUserIdsByTeam", () => {
  it("filters named team", () => {
    expect(filterUserIdsByTeam(profiles, "t-beta", null).sort()).toEqual(["m2"]);
  });

  it("filters ungrouped users", () => {
    expect(filterUserIdsByTeam(profiles, UNGROUPED_TEAM_ID, null)).toEqual(["m3"]);
  });

  it("intersects with visibleIds", () => {
    const visible = new Set(["m1", "m2"]);
    expect(filterUserIdsByTeam(profiles, "t-alpha", visible)).toEqual(["m1"]);
  });
});

describe("resolveAdminMonthReportScope", () => {
  const admin = { id: "a1", role: "admin" };
  const leader = { id: "l1", role: "leader", teamId: "t-alpha" };

  it("admin with no filter → site-wide", () => {
    expect(resolveAdminMonthReportScope(admin, {}, profiles)).toEqual({});
  });

  it("admin with teamId → team members", () => {
    expect(resolveAdminMonthReportScope(admin, { teamId: "t-beta" }, profiles)).toEqual({
      userIds: ["m2"],
    });
  });

  it("admin with empty team → empty userIds (not site-wide)", () => {
    expect(resolveAdminMonthReportScope(admin, { teamId: "t-missing" }, profiles)).toEqual({
      userIds: [],
    });
  });

  it("admin with ungrouped team", () => {
    expect(resolveAdminMonthReportScope(admin, { teamId: UNGROUPED_TEAM_ID }, profiles)).toEqual({
      userIds: ["m3"],
    });
  });

  it("admin with user in selected team", () => {
    expect(
      resolveAdminMonthReportScope(admin, { teamId: "t-alpha", userId: "m1" }, profiles),
    ).toEqual({ userId: "m1" });
  });

  it("admin with userId only → that user", () => {
    expect(resolveAdminMonthReportScope(admin, { userId: "m2" }, profiles)).toEqual({
      userId: "m2",
    });
  });

  it("blank teamId is treated as no team filter", () => {
    expect(resolveAdminMonthReportScope(admin, { teamId: "  " }, profiles)).toEqual({});
  });

  it("admin rejects user outside selected team", () => {
    expect(
      resolveAdminMonthReportScope(admin, { teamId: "t-alpha", userId: "m2" }, profiles),
    ).toEqual({ error: "该用户不属于所选团队" });
  });

  it("leader default → own team", () => {
    expect(resolveAdminMonthReportScope(leader, {}, profiles)).toEqual({
      userIds: ["a1", "l1", "m1"],
    });
  });

  it("leader cannot query another team", () => {
    expect(resolveAdminMonthReportScope(leader, { teamId: "t-beta" }, profiles)).toEqual({
      error: "无权查看该团队的报表",
    });
  });

  it("leader cannot query a user outside the team", () => {
    expect(resolveAdminMonthReportScope(leader, { userId: "m2" }, profiles)).toEqual({
      error: "无权查看该用户的报表",
    });
  });

  it("leader can query own team id (same as default)", () => {
    expect(resolveAdminMonthReportScope(leader, { teamId: "t-alpha" }, profiles)).toEqual({
      userIds: ["a1", "l1", "m1"],
    });
  });
});
