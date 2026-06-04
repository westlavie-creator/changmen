"use strict";

const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = process.env.GAMEBET_BACKEND_ROOT
  || path.join(__dirname, "../..");

const STORAGE_DIR = process.env.GAMEBET_STORAGE_DIR
  || path.join(BACKEND_ROOT, "storage");

const ESPORT_DATA_DIR = process.env.ESPORT_DATA_DIR || STORAGE_DIR;

function ensureStoragePaths() {
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });
}

ensureStoragePaths();

module.exports = {
  BACKEND_ROOT,
  STORAGE_DIR,
  ESPORT_DATA_DIR,
  ensureStoragePaths,
};
