import assert from "node:assert/strict";
import {
  isPbWsObserveLive,
  isPbWsSocketOpen,
  mergePbWsBoards,
} from "./pb-ws-observe.js";

assert.equal(isPbWsObserveLive({ connected: true }), true);
assert.equal(isPbWsObserveLive({ readyState: 1, phase: "hooked" }), true);
assert.equal(isPbWsObserveLive({ phase: "connected" }), true);
assert.equal(
  isPbWsObserveLive({ frameCount: 3, lastType: "UPDATE_ODDS", phase: "hooked" }),
  true,
);
assert.equal(isPbWsObserveLive({ phase: "hooked", latestOdds: [{ eventId: 1 }] }), false);
assert.equal(isPbWsObserveLive({ phase: "hook_start" }), false);
assert.equal(isPbWsObserveLive({ readyState: 3, connected: false }), false);
assert.equal(isPbWsObserveLive({ via: "closed", connected: true, lastType: "PING" }), false);
assert.equal(isPbWsSocketOpen({ lastType: "UPDATE_ODDS", frameCount: 9, phase: "hooked" }), false);
assert.equal(isPbWsSocketOpen({ connected: true }), true);

const euro = [
  { eventId: 1, period: 0, betType: 1, home: "1.50", away: "2.50", via: "http", homePriceAt: 1, awayPriceAt: 1 },
  { eventId: 2, period: 0, betType: 1, home: "3.00", away: "1.20", via: "http", homePriceAt: 1 },
];
const ws = [
  { eventId: 1, period: 0, betType: 1, home: "1.61", away: "2.40", via: "ws", homePriceAt: 9, awayPriceAt: 9 },
];

const afterWs = mergePbWsBoards(euro, ws, true);
const e1 = afterWs.find((c) => c.eventId === 1);
const e2 = afterWs.find((c) => c.eventId === 2);
assert.equal(e1.home, "1.61");
assert.equal(e1.via, "ws");
assert.equal(e2.home, "3.00");

const euroAgain = mergePbWsBoards(afterWs, euro, false);
const e1b = euroAgain.find((c) => c.eventId === 1);
assert.equal(e1b.home, "1.61");
assert.equal(e1b.via, "ws");

const wsHomeOnly = [
  { eventId: 1, period: 0, betType: 1, home: "1.70", via: "ws", homePriceAt: 20 },
];
const afterPartial = mergePbWsBoards(euro, wsHomeOnly, true);
const e1p = afterPartial.find((c) => c.eventId === 1);
assert.equal(e1p.home, "1.70");
assert.equal(e1p.away, "2.50");

const afterDead = mergePbWsBoards(afterWs, euro, false, true);
const e1d = afterDead.find((c) => c.eventId === 1);
assert.equal(e1d.home, "1.50");
assert.equal(e1d.via, "http");

console.log("pb-ws-observe.test.mjs ok");
