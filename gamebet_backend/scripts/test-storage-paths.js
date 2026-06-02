#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gamebet-storage-paths-"));
const backendRoot = path.join(root, "backend");
const oldDataDir = path.join(backendRoot, "data", "esport");
fs.mkdirSync(oldDataDir, { recursive: true });
fs.writeFileSync(path.join(oldDataDir, "users.json"), JSON.stringify([{ id: 1, userName: "legacy" }]));

process.env.GAMEBET_BACKEND_ROOT = backendRoot;
process.env.GAMEBET_STORAGE_DIR = path.join(backendRoot, "storage");
delete process.env.GAMEBET_CHANGMEN_ROOT;
delete process.env.GAMEBET_DB_DIR;
delete process.env.ESPORT_DATA_DIR;
delete process.env.GAMEBET_DB_PATH;

const paths = require("../shared/storage_paths.js");

assert.strictEqual(paths.DB_PATH, path.join(root, "gamebetdb", "gamebet.db"));
assert.strictEqual(paths.ESPORT_DATA_DIR, path.join(backendRoot, "storage", "legacy", "esport"));
assert.strictEqual(fs.existsSync(path.join(paths.ESPORT_DATA_DIR, "users.json")), true);

const db = require("../db/client.js");
db.prepare("CREATE TABLE smoke (id INTEGER PRIMARY KEY)").run();
assert.strictEqual(fs.existsSync(paths.DB_PATH), true);

console.log("storage paths default to changmen/gamebetdb and storage/legacy/esport ok");
