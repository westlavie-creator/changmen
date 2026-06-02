#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gamebet-user-settings-"));
const dataDir = path.join(root, "esport");
fs.mkdirSync(dataDir, { recursive: true });

process.env.ESPORT_DATA_DIR = dataDir;
process.env.GAMEBET_DB_PATH = path.join(root, "gamebet.db");

const store = require("../esport-api/store.js");
const { handleEsportRequest } = require("../esport-api/router.js");
const db = require("../db/client.js");

const users = [
  {
    id: 1,
    userName: "admin",
    passwordHash: store.hashPassword("admin", "admin-salt"),
    salt: "admin-salt",
    setting: {},
  },
  {
    id: 2,
    userName: "TJ01",
    passwordHash: store.hashPassword("a123456", "tj-salt"),
    salt: "tj-salt",
    setting: {},
  },
];

const legacyKv = {
  CollectConfig: JSON.stringify({ log: true, collect: [["OB", true]] }),
  USERCONFIG: JSON.stringify({ betting: true, betMoney: 88 }),
  PROXY: JSON.stringify([{ proxyId: 1, name: "p1" }]),
  ACCOUNT: JSON.stringify([{ accountId: 5, playerName: "tokyo" }]),
};

fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(users, null, 2));
fs.writeFileSync(path.join(dataDir, "user_kv.json"), JSON.stringify(legacyKv, null, 2));

function mockReq(body, token = "") {
  const raw = JSON.stringify(body);
  const listeners = { data: [], end: [], error: [] };
  return {
    method: "POST",
    headers: { "content-type": "application/json", token },
    on(ev, fn) {
      listeners[ev]?.push(fn);
    },
    _start() {
      listeners.data.forEach((fn) => fn(Buffer.from(raw)));
      listeners.end.forEach((fn) => fn());
    },
  };
}

function mockRes() {
  return {
    statusCode: 0,
    headersSent: false,
    body: "",
    writeHead(code) {
      this.statusCode = code;
      this.headersSent = true;
    },
    end(text) {
      this.body = text || "";
    },
  };
}

async function call(action, body, token) {
  const req = mockReq(body, token);
  const res = mockRes();
  const p = handleEsportRequest(req, res, `/esport/${action}`);
  req._start();
  await p;
  return JSON.parse(res.body || "null");
}

(async () => {
  store.ensureSeed();

  assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM user_settings WHERE user_id = 2").get().count >= 3, true);
  assert.deepStrictEqual(store.getUserSetting(2, "CollectConfig"), legacyKv.CollectConfig);
  assert.strictEqual(store.getUserSetting(1, "CollectConfig"), null);

  const adminToken = store.createSession(1);
  const tjToken = store.createSession(2);

  assert.deepStrictEqual(await call("Client_GetData", { key: "CollectConfig" }, tjToken), { log: true, collect: [["OB", true]] });
  assert.deepStrictEqual(await call("Client_GetData", { key: "PROXY" }, adminToken), []);

  const adminProxy = [{ proxyId: 9, name: "admin-proxy" }];
  assert.strictEqual((await call("Client_SaveData", { key: "PROXY", content: JSON.stringify(adminProxy) }, adminToken)).success, 1);
  assert.deepStrictEqual(await call("Client_GetData", { key: "PROXY" }, adminToken), adminProxy);
  assert.deepStrictEqual(await call("Client_GetData", { key: "PROXY" }, tjToken), [{ proxyId: 1, name: "p1" }]);

  console.log("user settings migrated to TJ01 and isolated by user ok");
})();
