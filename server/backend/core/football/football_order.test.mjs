import assert from "node:assert/strict";
import { parseFootballOrderInput, parseFootballOrderStatusPatch, publicFootballOrder } from "./football_order.js";

assert.equal(parseFootballOrderInput(null), null);
assert.equal(parseFootballOrderInput({}), null);

const parsed = parseFootballOrderInput({
  id: "t1",
  orderId: "8821",
  at: 1_970_000,
  home: "Arsenal",
  away: "Chelsea",
  sideLabel: "大 2.5",
  marketLabel: "全场 大小 2.5",
  odds: "1.95",
  stake: "50",
  oid: "oid-over",
  obMid: "5652292",
  auto: "1",
  playerId: "12",
  accountName: "ob1",
});
assert.equal(parsed.clientId, "t1");
assert.equal(parsed.venueOrderId, "8821");
assert.equal(parsed.venue, "OB");
assert.equal(parsed.auto, true);
assert.equal(parseFootballOrderInput({ id: "t2", auto: true }).auto, true);
assert.equal(parsed.playerId, 12);
assert.equal(parsed.odds, 1.95);
assert.equal(parsed.stake, 50);

const pub = publicFootballOrder({
  id: 9,
  client_id: "t1",
  venue_order_id: "8821",
  placed_at: 1_970_000,
  home: "Arsenal",
  away: "Chelsea",
  side_label: "大 2.5",
  market_label: "全场 大小 2.5",
  odds: 1.95,
  stake: 50,
  oid: "oid-over",
  ob_mid: "5652292",
  auto: true,
  venue: "OB",
  player_id: 12,
  account_name: "ob1",
  user_id: "u1",
  user_name: "river",
});
assert.equal(pub.id, "t1");
assert.equal(pub.orderId, "8821");
assert.equal(pub.userName, "river");
assert.equal(pub.rdsId, 9);
assert.equal(pub.status, "None");
assert.equal(pub.profit, 0);

const patch = parseFootballOrderStatusPatch({
  orderId: "8821",
  status: "Win",
  profit: 47.5,
});
assert.equal(patch.venueOrderId, "8821");
assert.equal(patch.status, "Win");
assert.equal(patch.profit, 47.5);
assert.equal(parseFootballOrderInput({ id: "t3", status: "lose" }).status, "Lose");

console.log("football_order: ok");
