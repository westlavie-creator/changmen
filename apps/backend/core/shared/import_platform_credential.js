import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseClipboardCredential } from "../account/clipboard_credential.js";
import { getActivePlatformGameIds } from "../../../../packages/shared/catalog/game_catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLATFORMS_FILE = path.join(__dirname, "../../data/esport/platforms.json");

const PROVIDER_DEFAULTS = {
  OB: { betName: ".*" },
  RAY: { betName: "^获胜者$" },
  PB: { betName: ".*" },
  TF: { betName: "^获胜者$" },
  IA: { betName: "([全场].+获胜$)|([地图\\d].+获胜者$)" },
  IM: { betName: ".*" },
  XBet: { betName: ".*" },
};

export function readPlatformsFile() {
  if (!fs.existsSync(PLATFORMS_FILE)) return {};
  return JSON.parse(fs.readFileSync(PLATFORMS_FILE, "utf8"));
}

export function writePlatformsFile(data) {
  fs.mkdirSync(path.dirname(PLATFORMS_FILE), { recursive: true });
  fs.writeFileSync(PLATFORMS_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function buildPlatformEntry(cred, prev = {}) {
  const provider = cred.provider;
  const defaults = PROVIDER_DEFAULTS[provider] || { betName: ".*" };
  const entry = {
    ...prev,
    gateway: cred.gateway,
    token: cred.token,
    referer: cred.referer || cred.gateway,
    provider,
    updatedAt: Date.now(),
  };

  if (cred.userAgent) entry.userAgent = cred.userAgent;
  if (defaults.betName !== undefined) {
    entry.betName = prev.betName ?? defaults.betName;
  }

  try {
    const gameIds = getActivePlatformGameIds(provider);
    if (gameIds.length) {
      entry.games = prev.games?.length ? prev.games : gameIds.map(String);
    }
  } catch {
    if (prev.games?.length) entry.games = prev.games;
  }

  if (provider === "PB" && entry.cookie === undefined) {
    entry.cookie = prev.cookie || "";
  }

  return entry;
}

/**
 * 将 A8 插件弹窗中的 data（Base64 JSON）写入 platforms.json，供 Node Feed 读取（与 OB 相同）。
 */
export function importPlatformCredential(base64Text) {
  const cred = parseClipboardCredential(base64Text);
  const key = cred.provider;
  const all = readPlatformsFile();
  const prev = all[key] || {};
  all[key] = buildPlatformEntry(cred, prev);
  writePlatformsFile(all);
  return { provider: key, entry: all[key], file: PLATFORMS_FILE };
}

export { PLATFORMS_FILE };
