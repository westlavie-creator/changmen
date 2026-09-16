/**
 * Stake / background 与 A8 2.0.149 细项对齐冒烟（纯逻辑，无 Chrome API）
 */
import assert from "node:assert/strict";
import { STAKE_LOCKDOWN_TOKEN } from "./src/content/config.js";
import { FIXTURE_SUBSCRIPTION } from "./src/content/stake/subscription.js";
import {
  STAKE_ODDS_PORT,
  STAKE_ODDS_PUSH_TYPE,
  STAKE_ODDS_EVENT,
  buildStakeOddsPush,
  fanoutStakeOdds,
} from "./src/stake-odds-protocol.js";

assert.equal(STAKE_LOCKDOWN_TOKEN, "s5MNWtjTM5TvCMkAzxov");
assert.ok(FIXTURE_SUBSCRIPTION.includes("sportFixtureMarketsNext"));
assert.ok(FIXTURE_SUBSCRIPTION.includes("$fixtureId"));

/** 对齐 A8 external setTab：response 含 value=tabId */
function buildExternalSetTabResponse(payload, tabId) {
  return { ...payload, value: tabId, tabId };
}
/** 对齐 A8 onMessage setTab：data.tabId = tabId，并带 value */
function buildInternalSetTabResponse(data, tabId) {
  return { ...data, key: data.key, tabId, value: tabId };
}

const ext = buildExternalSetTabResponse({ key: "Stake" }, 42);
assert.equal(ext.value, 42);
assert.equal(ext.tabId, 42);
assert.equal(ext.key, "Stake");

const inn = buildInternalSetTabResponse({ key: "Stake" }, 7);
assert.equal(inn.value, 7);
assert.equal(inn.tabId, 7);

/** getStore 形状：storage.get("Stake") → { Stake: n }，外包 { data } */
function wrapGetStore(areaResult) {
  return { data: areaResult };
}
assert.equal(wrapGetStore({ Stake: 99 }).data.Stake, 99);

/** connection_init payload 字段 */
const initPayload = {
  accessToken: "sess",
  language: "zh",
  lockdownToken: STAKE_LOCKDOWN_TOKEN,
};
assert.deepEqual(Object.keys(initPayload).sort(), ["accessToken", "language", "lockdownToken"]);

assert.equal(STAKE_ODDS_PORT, "stake-odds");
const push = buildStakeOddsPush("Stake", { matchId: "1", bets: [] });
assert.equal(push.type, STAKE_ODDS_PUSH_TYPE);
assert.equal(push.channel, "Stake");
const delivered = [];
const ports = new Set([
  { postMessage(payload) { delivered.push(payload); } },
]);
const event = fanoutStakeOdds(ports, { matchId: "fx", bets: [{ homeId: "h" }] });
assert.equal(event.type, STAKE_ODDS_EVENT);
assert.equal(event.channel, "Stake");
assert.equal(delivered.length, 1);
assert.equal(delivered[0].message.matchId, "fx");

console.log("stake-background-a8-parity: ok");
