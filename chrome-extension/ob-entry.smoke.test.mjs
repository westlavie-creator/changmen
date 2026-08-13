import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

// Node smoke：模拟浏览器 atob/btoa + 最小 performance
globalThis.crypto ??= webcrypto;
globalThis.atob = (s) => Buffer.from(s, "base64").toString("binary");
globalThis.btoa = (s) => Buffer.from(s, "binary").toString("base64");

const {
  parseObEsportEntry,
  parseObSportEntry,
  discoverObSportGateway,
  buildObEsportConfig,
  buildObSportConfig,
} = await import("./src/content/ob-entry.js");

const esportAddr = Buffer.from(
  JSON.stringify({ api: ["https://api-esport.example.com", "https://api2.example.com"] }),
  "utf8",
).toString("base64");
const esportHref = `https://dj-pc.example.com/?token=1234567890123456789&addr=${esportAddr}`;
const esport = parseObEsportEntry(esportHref);
assert.equal(esport?.kind, "esport");
assert.equal(esport?.token, "1234567890123456789");
assert.equal(esport?.gateway, "https://api-esport.example.com");
const esportCfg = buildObEsportConfig(esport);
assert.equal(esportCfg.provider, "OB");
assert.equal(esportCfg.gateway, "https://api-esport.example.com");
assert.equal(esportCfg.referer, "https://dj-pc.example.com/");
const esportData = JSON.parse(Buffer.from(esportCfg.data, "base64").toString("utf8"));
assert.deepEqual(esportData.gateway, ["https://api-esport.example.com", "https://api2.example.com"]);
assert.equal(esportData.referer, "https://dj-pc.example.com/");
assert.equal(esportData.kind, undefined);

const sportHref =
  "https://user-pc-new.zlshelves.com/?token=3d2d98226690510f2575b5d4c7a2de26f9b5e666&gr=y&api=9%2BwJRp03dsBAc%2BglpcePnaen%2Bdb%2FnrnNKxI8ARrM8fw%3D&sessionId=53595220421405155817865073474811";
const sport = parseObSportEntry(sportHref);
assert.equal(sport?.kind, "sport");
assert.equal(sport?.token, "3d2d98226690510f2575b5d4c7a2de26f9b5e666");
assert.ok(sport?.sessionId?.startsWith("53595"));
assert.equal(parseObEsportEntry(sportHref), null);
assert.equal(parseObSportEntry(esportHref), null);

const sportCfg = buildObSportConfig(sport, "https://api.937kddt.com");
assert.equal(sportCfg.gateway, "https://api.937kddt.com");
const sportData = JSON.parse(Buffer.from(sportCfg.data, "base64").toString("utf8"));
assert.equal(sportData.kind, "sport");
assert.equal(sportData.sessionId, sport.sessionId);
assert.deepEqual(sportData.gateway, ["https://api.937kddt.com"]);

const perf = {
  getEntriesByType: () => [
    { name: "https://cdn.example.com/app.js" },
    { name: "https://api.937kddt.com/yewu11/v1/w/getFilterMatchListPB?euid=1" },
  ],
};
assert.equal(discoverObSportGateway(perf), "https://api.937kddt.com");

// 纯数字 token + 无合法 addr → 不是体育
assert.equal(
  parseObSportEntry("https://x/?token=1234567890123456&api=abc&sessionId=1"),
  null,
);

console.log("ob-entry.smoke: ok");
