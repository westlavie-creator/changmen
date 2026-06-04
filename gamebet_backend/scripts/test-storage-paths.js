#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gamebet-storage-paths-"));
const backendRoot = path.join(root, "backend");

process.env.GAMEBET_BACKEND_ROOT = backendRoot;
process.env.GAMEBET_STORAGE_DIR  = path.join(backendRoot, "storage");
delete process.env.ESPORT_DATA_DIR;

const paths = require("../core/shared/storage_paths.js");

assert.strictEqual(paths.ESPORT_DATA_DIR, path.join(backendRoot, "storage", "esport"));
assert.strictEqual(fs.existsSync(paths.ESPORT_DATA_DIR), true);

console.log("storage paths ok:", paths.ESPORT_DATA_DIR);
