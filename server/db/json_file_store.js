/**
 * server/backend/storage/*.json 统一读写（ESPORT_DATA_DIR）。
 */
import fs from "node:fs";
import path from "node:path";
import { ESPORT_DATA_DIR } from "./paths.js";

function resolvePath(name) {
  const base = String(name).replace(/\.json$/i, "");
  return path.join(ESPORT_DATA_DIR, `${base}.json`);
}

export function readJsonFile(name, fallback) {
  const fp = resolvePath(name);
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJsonFile(name, data) {
  fs.mkdirSync(ESPORT_DATA_DIR, { recursive: true });
  fs.writeFileSync(resolvePath(name), JSON.stringify(data, null, 2), "utf8");
}

const _pendingWrites = new Map();
const _debounceTimers = new Map();

/** 合并多次写入，默认 5s 后落盘（用于 default_odds 等热路径）。 */
export function writeJsonFileDebounced(name, data, delayMs = 5000) {
  _pendingWrites.set(name, data);
  if (_debounceTimers.has(name)) return;
  const timer = setTimeout(() => {
    _debounceTimers.delete(name);
    const pending = _pendingWrites.get(name);
    _pendingWrites.delete(name);
    if (pending !== undefined) writeJsonFile(name, pending);
  }, delayMs);
  if (typeof timer.unref === "function") timer.unref();
  _debounceTimers.set(name, timer);
}

export function flushJsonFileDebounced(name) {
  const timer = _debounceTimers.get(name);
  if (timer) {
    clearTimeout(timer);
    _debounceTimers.delete(name);
  }
  const pending = _pendingWrites.get(name);
  if (pending === undefined) return;
  _pendingWrites.delete(name);
  writeJsonFile(name, pending);
}
