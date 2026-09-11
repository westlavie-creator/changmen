/**
 * Part888 活头：515 不合并 X-U；plain 合并。
 * 运行：node pb-page-auth.smoke.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildLivePbAuthHeaders,
  detectPbPageSessionMode,
  isPbA8K0PageSession,
} from "./src/content/pb/page-auth.js";

const s515 = {
  "x-app-data": JSON.stringify({ BrowserSessionId_515: "sess", custid_515: "id%3Dabc" }),
  custid_515: "id%3Dabc",
  token: JSON.stringify({ "X-U": "stale", "X-U-515": "stale-515" }),
  "v-hucode": "hu",
};
assert.equal(isPbA8K0PageSession(detectPbPageSessionMode(s515)), true);
const h515 = buildLivePbAuthHeaders(s515);
assert.equal(h515["x-browser-session-id-515"], "sess");
assert.equal(h515["x-u"], undefined);
assert.equal(h515["x-u-515"], undefined);

const plain = {
  "x-app-data": JSON.stringify({ BrowserSessionId: "sess-plain", custid: "id%3Dabc" }),
  token: JSON.stringify({
    "X-U": "u-token",
    "X-Browser-Session-Id": "sess-plain",
    "X-Custid": "id=abc",
  }),
};
assert.equal(isPbA8K0PageSession(detectPbPageSessionMode(plain)), false);
const hPlain = buildLivePbAuthHeaders(plain, { "content-type": "application/json" });
assert.equal(hPlain["x-browser-session-id"], "sess-plain");
assert.equal(hPlain["x-u"], "u-token");
assert.equal(hPlain["content-type"], "application/json");
assert.equal(hPlain["x-browser-session-id-515"], undefined);

const noOverwrite = buildLivePbAuthHeaders(plain, {
  "content-type": "application/json",
  "X-U": "stale-frozen",
  "x-browser-session-id": "stale-sess",
});
assert.equal(noOverwrite["x-u"], "u-token");
assert.equal(noOverwrite["x-browser-session-id"], "sess-plain");
assert.equal(noOverwrite["content-type"], "application/json");

console.log("pb-page-auth.smoke.test.mjs: ok");
