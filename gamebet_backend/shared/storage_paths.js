"use strict";

const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = process.env.GAMEBET_BACKEND_ROOT
  || path.join(__dirname, "..");

const CHANGMEN_ROOT = process.env.GAMEBET_CHANGMEN_ROOT
  || path.dirname(BACKEND_ROOT);

const STORAGE_DIR = process.env.GAMEBET_STORAGE_DIR
  || path.join(BACKEND_ROOT, "storage");

const LEGACY_DIR = path.join(STORAGE_DIR, "legacy");
const LEGACY_ESPORT_DIR = path.join(LEGACY_DIR, "esport");

const OLD_DATA_DIR = path.join(BACKEND_ROOT, "data");
const OLD_ESPORT_DATA_DIR = path.join(OLD_DATA_DIR, "esport");

const ESPORT_DATA_DIR = process.env.ESPORT_DATA_DIR
  || LEGACY_ESPORT_DIR;

function copyDirContentsIfMissing(fromDir, toDir) {
  if (!fs.existsSync(fromDir)) return;
  fs.mkdirSync(toDir, { recursive: true });
  for (const name of fs.readdirSync(fromDir)) {
    const fromPath = path.join(fromDir, name);
    const toPath = path.join(toDir, name);
    if (fs.existsSync(toPath)) continue;
    const stat = fs.statSync(fromPath);
    if (stat.isDirectory()) fs.cpSync(fromPath, toPath, { recursive: true });
    else fs.copyFileSync(fromPath, toPath);
  }
}

function ensureStoragePaths() {
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });

  if (!process.env.ESPORT_DATA_DIR) {
    copyDirContentsIfMissing(OLD_ESPORT_DATA_DIR, ESPORT_DATA_DIR);
  }
}

ensureStoragePaths();

module.exports = {
  BACKEND_ROOT,
  CHANGMEN_ROOT,
  STORAGE_DIR,
  LEGACY_DIR,
  ESPORT_DATA_DIR,
  OLD_DATA_DIR,
  OLD_ESPORT_DATA_DIR,
  ensureStoragePaths,
};
