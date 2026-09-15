/**
 * Client_AdminFootballOrders 必须按调用者角色收窄，与电竞 listAdminOrders 同权。
 */
import assert from "node:assert/strict";
import { resolveAdminFootballOrdersScope } from "./football_order_admin_scope.js";

const teamA = [
  { id: "u-leader", team_id: "t1", role: "leader" },
  { id: "u-member", team_id: "t1", role: "user" },
  { id: "u-other", team_id: "t2", role: "user" },
];

const leader = { id: "u-leader", role: "leader", team_id: "t1" };
const siteAdmin = { id: "u-admin", role: "admin" };

{
  const scope = resolveAdminFootballOrdersScope(leader, {}, teamA);
  assert.equal(scope.denied, false);
  assert.equal(scope.userId, "");
  assert.deepEqual(new Set(scope.userIds), new Set(["u-leader", "u-member"]));
}

{
  const scope = resolveAdminFootballOrdersScope(leader, { userId: "u-member" }, teamA);
  assert.equal(scope.denied, false);
  assert.equal(scope.userId, "u-member");
  assert.equal(scope.userIds, undefined);
}

{
  const scope = resolveAdminFootballOrdersScope(leader, { userId: "u-other" }, teamA);
  assert.equal(scope.denied, true);
}

{
  const scope = resolveAdminFootballOrdersScope(siteAdmin, {}, teamA);
  assert.equal(scope.denied, false);
  assert.equal(scope.userId, "");
  assert.equal(scope.userIds, undefined);
}

{
  const scope = resolveAdminFootballOrdersScope(siteAdmin, { userId: "u-other" }, teamA);
  assert.equal(scope.denied, false);
  assert.equal(scope.userId, "u-other");
}

console.log("football_order_admin_scope: ok");
