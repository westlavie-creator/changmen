"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { findChangmenRoot } = require("./changmen_root.cjs");

const CHANGMEN_ROOT = findChangmenRoot(__dirname);

const BACKEND_ROOT =
  process.env.GAMEBET_BACKEND_ROOT || path.join(CHANGMEN_ROOT, "apps", "backend");

const STORAGE_DIR =
  process.env.GAMEBET_STORAGE_DIR || path.join(BACKEND_ROOT, "storage");

const ESPORT_DATA_DIR = process.env.ESPORT_DATA_DIR || STORAGE_DIR;

function ensureStoragePaths() {
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });
}

ensureStoragePaths();

module.exports = {
  CHANGMEN_ROOT,
  BACKEND_ROOT,
  STORAGE_DIR,
  ESPORT_DATA_DIR,
  ensureStoragePaths,
};
