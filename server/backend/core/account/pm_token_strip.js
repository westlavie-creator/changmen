/**
 * Polymarket token 落库契约（方案 C）
 *
 * 写入 RDS 的唯一合法形态（DTO）：
 *   walletAddress, funder, signatureType(0-3), apiCreds
 *
 * - Save：若仍含私钥材料 → 直接拒绝（由 account_service 返回错误）
 * - 投影 / Get / Admin：白名单 DTO（兼容旧脏数据，读出时洗净）
 * - POLY_* 请求头由 apiCreds 现算，不落库 polyHeaders
 */

const MAX_TOKEN_UNWRAP = 8;
const MAX_SCAN_DEPTH = 12;

function decodeBase64Utf8(text) {
  try {
    return Buffer.from(String(text), "base64").toString("utf8");
  }
  catch {
    return undefined;
  }
}

function parseTokenObject(raw) {
  if (raw == null || typeof raw !== "string")
    return null;
  const text = raw.trim();
  if (!text)
    return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      return parsed;
  }
  catch {
    /* try base64 */
  }
  const decoded = decodeBase64Utf8(text);
  if (!decoded)
    return null;
  try {
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  }
  catch {
    return null;
  }
}

function looksLikeRawPrivateKey(text) {
  return /^0x?[0-9a-fA-F]{64}$/.test(String(text).trim());
}

function isPrivateKeyPropName(key) {
  return /^private_?key$/i.test(String(key));
}

/** 仅接受标准 ETH 地址 */
function pickEthAddress(raw) {
  const s = String(raw ?? "").trim();
  if (!s || looksLikeRawPrivateKey(s))
    return "";
  return /^0x[0-9a-fA-F]{40}$/.test(s) ? s : "";
}

function rejectIfPrivateKeyShaped(raw) {
  const s = String(raw ?? "").trim();
  if (!s || looksLikeRawPrivateKey(s))
    return "";
  return s;
}

/** signatureType 仅允许 0–3 */
function pickSignatureType(raw, walletAddress, funder) {
  if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
    if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw <= 3)
      return raw;
    const s = String(raw).trim();
    if (/^[0-3]$/.test(s))
      return s;
  }
  if (walletAddress && funder && walletAddress.toLowerCase() !== funder.toLowerCase())
    return "3";
  return undefined;
}

function resolveConfigObject(raw, unwrap = 0) {
  const obj = parseTokenObject(raw);
  if (!obj)
    return null;
  if (unwrap >= MAX_TOKEN_UNWRAP)
    return obj;
  if (typeof obj.token === "string" && obj.token.trim()) {
    const nested = resolveConfigObject(obj.token, unwrap + 1);
    if (nested)
      return nested;
  }
  return obj;
}

function pickApiCreds(obj) {
  const rawApi = obj.apiCreds;
  const api = rawApi && typeof rawApi === "object" && !Array.isArray(rawApi)
    ? rawApi
    : obj;
  const apiKey = rejectIfPrivateKeyShaped(api.apiKey ?? api.key ?? api.api_key ?? "");
  const secret = rejectIfPrivateKeyShaped(api.secret ?? api.apiSecret ?? api.api_secret ?? "");
  const passphrase = rejectIfPrivateKeyShaped(api.passphrase ?? "");
  if (!apiKey || !secret || !passphrase)
    return undefined;
  return { apiKey, secret, passphrase };
}

function hasPrivateKeyMaterialInValue(val, depth, seen) {
  if (depth > MAX_SCAN_DEPTH)
    return false;
  if (typeof val === "string") {
    if (looksLikeRawPrivateKey(val))
      return true;
    const nested = parseTokenObject(val);
    return nested ? hasPrivateKeyMaterialInObject(nested, depth + 1, seen) : false;
  }
  if (!val || typeof val !== "object")
    return false;
  if (Array.isArray(val)) {
    for (const item of val) {
      if (hasPrivateKeyMaterialInValue(item, depth + 1, seen))
        return true;
    }
    return false;
  }
  return hasPrivateKeyMaterialInObject(val, depth, seen);
}

function hasPrivateKeyMaterialInObject(obj, depth, seen) {
  if (seen.has(obj))
    return false;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (isPrivateKeyPropName(k))
      return true;
    if (hasPrivateKeyMaterialInValue(v, depth + 1, seen))
      return true;
  }
  return false;
}

/** Save 契约：请求体是否仍夹带私钥材料 */
export function polymarketTokenHasPrivateKeyMaterial(token) {
  if (token == null || typeof token !== "string")
    return false;
  const text = token.trim();
  if (!text)
    return false;
  if (looksLikeRawPrivateKey(text))
    return true;
  const obj = parseTokenObject(text);
  if (!obj)
    return false;
  return hasPrivateKeyMaterialInObject(obj, 0, new WeakSet());
}

/**
 * 白名单 DTO 投影（读旧数据 / 兼容清洗）。
 * 无法解析 / 裸私钥 → 空串。
 * @param {unknown} token
 * @returns {string|undefined}
 */
export function toPolymarketPersistToken(token) {
  if (token == null)
    return token === null ? undefined : "";
  if (typeof token !== "string")
    return "";
  const text = token.trim();
  if (!text)
    return token;
  if (looksLikeRawPrivateKey(text))
    return "";
  const obj = resolveConfigObject(text);
  if (!obj)
    return "";

  const out = {};
  const walletAddress = pickEthAddress(obj.walletAddress ?? obj.address ?? "");
  const funder = pickEthAddress(obj.funder ?? obj.funderAddress ?? "");
  if (walletAddress)
    out.walletAddress = walletAddress;
  if (funder)
    out.funder = funder;

  const sig = pickSignatureType(obj.signatureType, walletAddress, funder);
  if (sig !== undefined)
    out.signatureType = sig;

  const apiCreds = pickApiCreds(obj);
  if (apiCreds)
    out.apiCreds = apiCreds;

  return JSON.stringify(out);
}

/** @deprecated 使用 toPolymarketPersistToken */
export const stripPolymarketPrivateKeyFromToken = toPolymarketPersistToken;

function isPolymarketRow(row) {
  const provider = String(row?.provider ?? row?.Provider ?? row?.platform ?? row?.Platform ?? "").toLowerCase();
  return provider === "polymarket" || provider === "pm";
}

/**
 * Save 前契约：含私钥 → 拒绝；否则投影为 DTO。
 * @returns {{ ok: true } | { ok: false, msg: string }}
 */
export function enforcePolymarketPersistDto(accounts) {
  if (!Array.isArray(accounts))
    return { ok: true };
  for (const row of accounts) {
    if (!row || typeof row !== "object" || !isPolymarketRow(row))
      continue;
    const raw = row.token ?? row.Token;
    if (raw != null && polymarketTokenHasPrivateKeyMaterial(String(raw))) {
      return {
        ok: false,
        msg: "Polymarket token 禁止包含私钥；请使用本机钱包仓，仅提交 walletAddress/funder/apiCreds/signatureType",
      };
    }
  }
  projectPolymarketAccountTokens(accounts);
  return { ok: true };
}

/** Get/Admin：投影为 DTO（洗净历史脏数据） */
export function projectPolymarketAccountTokens(accounts) {
  if (!Array.isArray(accounts))
    return accounts;
  for (const row of accounts)
    projectPolymarketAccountRow(row);
  return accounts;
}

export function projectPolymarketAccountRow(row) {
  if (!row || typeof row !== "object" || !isPolymarketRow(row))
    return row;
  if (row.token != null)
    row.token = toPolymarketPersistToken(row.token);
  if (row.Token != null)
    row.Token = toPolymarketPersistToken(row.Token);
  return row;
}

/** @deprecated 使用 projectPolymarketAccountRow */
export const stripPrivateKeyFromAccountRow = projectPolymarketAccountRow;

/** @deprecated 使用 projectPolymarketAccountTokens */
export const stripPrivateKeysFromAccountList = projectPolymarketAccountTokens;
