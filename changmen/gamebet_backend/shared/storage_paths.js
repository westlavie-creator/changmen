"use strict";

const fs = require("fs");
const path = require("path");

const BACKEND_ROOT = process.env.GAMEBET_BACKEND_ROOT
  || path.join(__dirname, "..");

const CHANGMEN_ROOT = process.env.GAMEBET_CHANGMEN_ROOT
  || path.dirname(BACKEND_ROOT);

const STORAGE_DIR = process.env.GAMEBET_STORAGE_DIR
  || path.join(BACKEND_ROOT, "storage");

const DB_DIR = process.env.GAMEBET_DB_DIR
  || path.join(CHANGMEN_ROOT, "gamebetdb");
const LEGACY_DIR = path.join(STORAGE_DIR, "legacy");
const LEGACY_ESPORT_DIR = path.join(LEGACY_DIR, "esport");

const OLD_DATA_DIR = path.join(BACKEND_ROOT, "data");
const OLD_DB_PATH = path.join(OLD_DATA_DIR, "gamebet.db");
const STORAGE_DB_PATH = path.join(STORAGE_DIR, "db", "gamebet.db");
const OLD_ESPORT_DATA_DIR = path.join(OLD_DATA_DIR, "esport");

const DB_PATH = process.env.GAMEBET_DB_PATH
  || path.join(DB_DIR, "gamebet.db");

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

function copyFileIfMissing(fromFile, toFile) {
  if (!fs.existsSync(fromFile) || fs.existsSync(toFile)) return;
  fs.mkdirSync(path.dirname(toFile), { recursive: true });
  fs.copyFileSync(fromFile, toFile);
}

function copyDbIfMissing(fromDbPath) {
  if (!fs.existsSync(fromDbPath) || fs.existsSync(DB_PATH)) return;
  copyFileIfMissing(fromDbPath, DB_PATH);
  copyFileIfMissing(`${fromDbPath}-wal`, `${DB_PATH}-wal`);
  copyFileIfMissing(`${fromDbPath}-shm`, `${DB_PATH}-shm`);
}

function ensureStoragePaths() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });

  if (!process.env.ESPORT_DATA_DIR) {
    copyDirContentsIfMissing(OLD_ESPORT_DATA_DIR, ESPORT_DATA_DIR);
  }

  if (!process.env.GAMEBET_DB_PATH) {
    copyDbIfMissing(STORAGE_DB_PATH);
    copyDbIfMissing(OLD_DB_PATH);
  }
}

ensureStoragePaths();

module.exports = {
  BACKEND_ROOT,
  CHANGMEN_ROOT,
  STORAGE_DIR,
  DB_DIR,
  LEGACY_DIR,
  DB_PATH,
  ESPORT_DATA_DIR,
  OLD_DATA_DIR,
  OLD_DB_PATH,
  STORAGE_DB_PATH,
  OLD_ESPORT_DATA_DIR,
  ensureStoragePaths,
};
