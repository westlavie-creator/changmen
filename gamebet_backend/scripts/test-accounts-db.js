#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gamebet-accounts-db-"));
const dataDir = path.join(root, "esport");
fs.mkdirSync(dataDir, { recursive: true });

process.env.ESPORT_DATA_DIR = dataDir;
process.env.GAMEBET_DB_PATH = path.join(root, "gamebet.db");

const store = require("../esport-api/store.js");
const { handleEsportRequest } = require("../esport-api/router.js");
const db = require("../db/client.js");

const adminSalt = "admin-salt";
const tjSalt = "tj-salt";
const users = [
  {
    id: 1,
    userName: "admin",
    passwordHash: store.hashPassword("admin", adminSalt),
    salt: adminSalt,
    setting: {},
  },
  {
    id: 2,
    userName: "TJ01",
    passwordHash: store.hashPassword("a123456", tjSalt),
    salt: tjSalt,
    setting: { a8UserName: "TJ01", a8Password: "a123456" },
  },
];

const legacyAccounts = [
  { accountId: 5, platformName: "ob", playerName: "tokyo", provider: "OB", token: "ob-token" },
  { accountId: 2, platformName: "PB", playerName: "PPP", provider: "PB", token: "pb-token" },
];

fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(users, null, 2));
fs.writeFileSync(
  path.join(dataDir, "user_kv.json"),
  JSON.stringify({ ACCOUNT: JSON.stringify(legacyAccounts) }, null, 2),
);

function mockReq(body, token = "") {
  const raw = JSON.stringify(body);
  const listeners = { data: [], end: [], error: [] };
  return {
    method: "POST",
    url: "/esport/Client_GetData",
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
    headersSent: false,
    statusCode: 0,
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

  const tjAccounts = db.prepare("SELECT * FROM accounts WHERE user_id = 2 ORDER BY account_id").all();
  assert.strictEqual(tjAccounts.length, legacyAccounts.length);
  assert.strictEqual(db.prepare("SELECT COUNT(*) AS count FROM accounts WHERE user_id = 1").get().count, 0);

  const adminToken = store.createSession(1);
  const tjToken = store.createSession(2);

  assert.deepStrictEqual(await call("Client_GetData", { key: "ACCOUNT" }, adminToken), []);
  assert.deepStrictEqual(await call("Client_GetData", { key: "ACCOUNT" }, tjToken), legacyAccounts);

  const adminAccounts = [{ accountId: 9, platformName: "admin-only", playerName: "A", provider: "OB" }];
  assert.strictEqual((await call("Client_SaveData", { key: "ACCOUNT", content: JSON.stringify(adminAccounts) }, adminToken)).success, 1);
  assert.deepStrictEqual(await call("Client_GetData", { key: "ACCOUNT" }, adminToken), adminAccounts);
  assert.deepStrictEqual(await call("Client_GetData", { key: "ACCOUNT" }, tjToken), legacyAccounts);

  console.log("accounts table TJ01 migration and user isolation ok");
})();
