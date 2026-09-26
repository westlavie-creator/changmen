import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const token = "3d2d98226690510f2575b5d4c7a2de26f9b5e666";
const requestUrl = `https://www.iz9a9g.vip:6677/yewu12/api/user/getUserInfo?token=${token}&enName=OBSPORT`;
const saved = [];
let observerCallback;
let messageListener;
let stored;
let idbOpenCount = 0;

class MockPerformanceObserver {
  constructor(callback) {
    observerCallback = callback;
  }

  observe() {}
}

const context = {
  URL,
  Date,
  location: {
    href: "https://www.iz9a9g.vip:6677/home/sports/OBSPORT?api_id=53",
    origin: "https://www.iz9a9g.vip:6677",
    pathname: "/home/sports/OBSPORT",
  },
  performance: {
    getEntriesByType: () => [{ name: requestUrl }],
  },
  PerformanceObserver: MockPerformanceObserver,
  chrome: {
    storage: {
      local: {
        get: (_key, callback) => callback(stored ? { "gamebet.obSportMerchantCreds": stored } : {}),
        set: (value) => {
          stored = value["gamebet.obSportMerchantCreds"];
          saved.push(value);
        },
      },
    },
  },
  addEventListener: (type, listener) => {
    if (type === "message")
      messageListener = listener;
  },
  setInterval: () => 1,
  clearInterval: () => {},
  indexedDB: {
    // 刻意不提供 databases()，模拟部分指纹浏览器内核。
    open: () => {
      idbOpenCount += 1;
      const request = {};
      queueMicrotask(() => {
        const tx = {
          objectStore: () => ({
            getAll: () => {
              const getAll = {};
              queueMicrotask(() => {
                getAll.result = [{
                  requestId: token,
                  origin: "https://api.cgfoznmy.com",
                  cuid: "53554662319712599617",
                }];
                getAll.onsuccess?.();
                tx.oncomplete?.();
              });
              return getAll;
            },
          }),
        };
        request.result = {
          objectStoreNames: { contains: name => name === "shared_params" },
          transaction: () => tx,
          close: () => {},
        };
        request.onsuccess?.();
      });
      return request;
    },
  },
};
context.globalThis = context;

const source = fs.readFileSync(
  new URL("./src/content/page-hooks/ob-sport-merchant-capture.js", import.meta.url),
  "utf8",
);
vm.runInNewContext(source, context);
const vmGlobal = vm.runInNewContext("globalThis", context);
await new Promise(resolve => setImmediate(resolve));

assert.equal(idbOpenCount, 1);
const row = stored;
assert.equal(row.token, token);
assert.equal(row.source, "merchant-proxy");
assert.equal(row.gateway, "https://api.cgfoznmy.com");
assert.equal(row.sessionId, "53554662319712599617");
assert.equal(row.pageOrigin, "https://www.iz9a9g.vip:6677");

messageListener({
  source: vmGlobal,
  data: {
    source: "changmen-ob-sport-merchant-hook",
    kind: "credential",
    token,
    gateway: "https://app-h5.janbo0931.com",
    sessionId: "53554662319712599617",
  },
});
assert.equal(stored.gateway, "https://api.cgfoznmy.com");
assert.equal(stored.sessionId, "53554662319712599617");

const savedBeforeInvalidToken = saved.length;
observerCallback({
  getEntries: () => [{
    name: "https://www.iz9a9g.vip:6677/yewu12/api/user/getUserInfo?token=1234567890123456789&enName=OBSPORT",
  }],
});
assert.equal(saved.length, savedBeforeInvalidToken, "电竞纯数字 token 不得被识别为体育 token");

console.log("ob-merchant-capture.smoke: ok");
