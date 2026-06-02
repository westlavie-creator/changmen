#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gamebet-users-db-"));
const dataDir = path.join(root, "esport");
fs.mkdirSync(dataDir, { recursive: true });

process.env.ESPORT_DATA_DIR = dataDir;
process.env.GAMEBET_DB_PATH = path.join(root, "gamebet.db");

const users = [
  {
    id: 1,
    userName: "admin",
    passwordHash: "admin-hash",
    salt: "admin-salt",
    setting: {},
  },
  {
    id: 2,
    userName: "TJ01",
    passwordHash: "tj-hash",
    salt: "tj-salt",
    setting: { a8UserName: "TJ01", a8Password: "a123456" },
  },
];

fs.writeFileSync(path.join(dataDir, "users.json"), JSON.stringify(users, null, 2));
fs.writeFileSync(
  path.join(dataDir, "user_kv.json"),
  JSON.stringify({ ACCOUNT: JSON.stringify([{ accountId: 99, playerName: "not-login-user" }]) }, null, 2),
);

const store = require("../esport-api/store.js");
const db = require("../db/client.js");

store.ensureSeed();

const rows = db.prepare("SELECT id, user_name, password_hash, salt, setting FROM users ORDER BY id").all();
assert.deepStrictEqual(
  rows.map((row) => ({
    id: row.id,
    userName: row.user_name,
    passwordHash: row.password_hash,
    salt: row.salt,
    setting: JSON.parse(row.setting),
  })),
  users,
);

fs.renameSync(path.join(dataDir, "users.json"), path.join(dataDir, "users.json.bak"));
assert.strictEqual(store.getUserByName("TJ01").passwordHash, "tj-hash");
assert.strictEqual(store.getUserByName("not-login-user"), undefined);

const created = store.createUser("new-login", "secret", { role: "tester" });
assert.strictEqual(store.getUserById(created.id).userName, "new-login");
assert.strictEqual(store.getUserByName("new-login").setting.role, "tester");

console.log("users table migration/login source ok");
