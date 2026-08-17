/**
 * PB 复制前凭证校验
 * 运行：node pb-credential.smoke.test.mjs
 */
import assert from "node:assert/strict";
import { validatePbLocalStorageSnapshot } from "./src/content/pb-credential.js";

assert.equal(
  validatePbLocalStorageSnapshot({}),
  "缺少 x-app-data：请在已登录的平博页再复制",
);

const plainOk = {
  "x-app-data": JSON.stringify({
    BrowserSessionId: "sess",
    custid: "id%3Dabc",
  }),
  token: JSON.stringify({
    "X-Browser-Session-Id": "sess",
    "X-Custid": "id=abc",
    "X-U": "u-token",
  }),
};
assert.equal(validatePbLocalStorageSnapshot(plainOk), null);

const plainNoXu = {
  "x-app-data": JSON.stringify({
    BrowserSessionId: "sess",
    custid: "id%3Dabc",
  }),
  token: JSON.stringify({
    "X-Browser-Session-Id": "sess",
    "X-Custid": "id=abc",
  }),
};
assert.match(validatePbLocalStorageSnapshot(plainNoXu) || "", /X-U/);

const plainNoInner = {
  "x-app-data": JSON.stringify({
    BrowserSessionId: "sess",
    custid: "id%3Dabc",
  }),
};
assert.match(validatePbLocalStorageSnapshot(plainNoInner) || "", /内层 token/);

const s1228 = {
  "x-app-data": JSON.stringify({
    BrowserSessionId_1228: "sess",
    custid_1228: "id%3Dabc",
  }),
  token: JSON.stringify({
    "X-U-1228": "u",
  }),
};
assert.equal(validatePbLocalStorageSnapshot(s1228), null);

const s1228NoXu = {
  "x-app-data": JSON.stringify({
    BrowserSessionId_1228: "sess",
    custid_1228: "id%3Dabc",
  }),
  token: JSON.stringify({
    "X-Custid-1228": "id=abc",
  }),
};
assert.match(validatePbLocalStorageSnapshot(s1228NoXu) || "", /X-U/);

console.log("pb-credential.smoke.test.mjs: ok");
