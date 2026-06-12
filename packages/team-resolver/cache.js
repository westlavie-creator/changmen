"use strict";

const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "cache");
const CACHE_FILE = path.join(CACHE_DIR, "teams.json");
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7天

let _mem = null;

function _load() {
  if (_mem) return _mem;
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (fs.existsSync(CACHE_FILE)) {
      _mem = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } else {
      _mem = {};
    }
  } catch {
    _mem = {};
  }
  return _mem;
}

function _save() {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_mem, null, 2), "utf8");
  } catch (err) {
    console.warn("[cache] 写入失败:", err.message);
  }
}

/** key = "{normalizedName}:{gameCode}" */
function get(normalizedName, gameCode) {
  const data = _load();
  const entry = data[`${normalizedName}:${gameCode}`];
  if (!entry) return null;
  if (Date.now() - entry.resolvedAt > TTL_MS) return null; // 过期
  return entry;
}

function set(normalizedName, gameCode, result) {
  const data = _load();
  data[`${normalizedName}:${gameCode}`] = { ...result, resolvedAt: Date.now() };
  _save();
}

/** 列出所有缓存条目（调试用）*/
function list() {
  return Object.entries(_load()).map(([k, v]) => ({ key: k, ...v }));
}

function clear() {
  _mem = {};
  _save();
}

module.exports = { get, set, list, clear };
