import { PLATFORMS } from "../platforms.js";

const CLOB_API = "https://clob.polymarket.com";
const GAMMA_API = "https://gamma-api.polymarket.com";

/**
 * Polymarket 凭证采集保持零侵入：不改写页面 fetch/XHR，只在点击采集图标时读取 storage。
 */
export function getPolymarketCredentials() {
  const captured = collectStorageCredentials();
  const { polyHeaders, apiCreds, account, storage } = captured;
  const walletAddress =
    polyHeaders.POLY_ADDRESS ||
    polyHeaders.poly_address ||
    account.address ||
    account.walletAddress ||
    "";
  const funder =
    account.funder ||
    account.funderAddress ||
    account.proxyWallet ||
    account.proxyWalletAddress ||
    "";
  const signatureType = account.signatureType || inferSignatureType(walletAddress, funder, apiCreds, storage);

  const token = JSON.stringify({
    walletAddress,
    funder,
    signatureType,
    apiCreds,
    polyHeaders,
  });
  const payload = {
    provider: PLATFORMS.Polymarket,
    gateway: CLOB_API,
    gammaApi: GAMMA_API,
    referer: location.href,
    token,
    walletAddress,
    funder,
    signatureType,
    apiCreds,
    polyHeaders,
    account,
    storage,
    capturedAt: new Date().toISOString(),
  };

  return {
    ...payload,
    data: base64Utf8(JSON.stringify(payload)),
  };
}

function base64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function inferSignatureType(walletAddress, funder, apiCreds, storage) {
  if (hasClobApiKeyMap(storage) || apiCreds.baseAddress)
    return "3";
  if (walletAddress && funder && walletAddress.toLowerCase() !== funder.toLowerCase())
    return "3";
  return "";
}

function hasClobApiKeyMap(storage) {
  return Object.values(storage).some((bucket) =>
    bucket
    && typeof bucket === "object"
    && Object.keys(bucket).some(key => key.toLowerCase().includes("poly_clob_api_key_map")),
  );
}

const STORAGE_KEY_RE = /(poly|polymarket|privy|dynamic|wallet|clob|api.?key|passphrase|funder|address)/i;

function collectStorageCredentials() {
  const polyHeaders = {};
  const apiCreds = {};
  const account = {};
  const storage = {};

  readStorage("localStorage", localStorage, storage, apiCreds, account, polyHeaders);
  readStorage("sessionStorage", sessionStorage, storage, apiCreds, account, polyHeaders);

  return { polyHeaders, apiCreds, account, storage };
}

function readStorage(label, store, storage, apiCreds, account, polyHeaders) {
  try {
    const bucket = {};
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key || !STORAGE_KEY_RE.test(key)) continue;
      const value = store.getItem(key);
      bucket[key] = typeof value === "string" && value.length > 2000 ? value.slice(0, 2000) : value;
      capturePayload(value, apiCreds, account, polyHeaders);
      captureKeyValue(key, value, apiCreds, account, polyHeaders);
    }
    if (Object.keys(bucket).length) storage[label] = bucket;
  } catch {
    /* storage can be unavailable in restricted frames */
  }
}

function captureKeyValue(key, value, apiCreds, account, polyHeaders) {
  const lower = String(key).toLowerCase();
  if (value == null || typeof value === "object") return;
  const text = String(value);
  if (lower.includes("poly_address")) polyHeaders.POLY_ADDRESS = text;
  if (lower.includes("poly_api_key")) polyHeaders.POLY_API_KEY = text;
  if (lower.includes("poly_passphrase")) polyHeaders.POLY_PASSPHRASE = text;
  if (lower.includes("apikey") || lower.includes("api_key") || lower.includes("api-key")) apiCreds.apiKey ||= text;
  if (lower.includes("secret")) apiCreds.secret ||= text;
  if (lower.includes("passphrase")) apiCreds.passphrase ||= text;
  if (lower.includes("baseaddress") || lower.includes("base_address")) apiCreds.baseAddress ||= text;
  if (lower.includes("wallet") || lower.includes("address")) account.address ||= text;
  if (lower.includes("funder")) account.funder ||= text;
}

function capturePayload(raw, apiCreds, account, polyHeaders) {
  const data = maybeJson(raw);
  if (!data) return;
  visit(data, (key, value) => {
    if (value == null || typeof value === "object") return;
    const lower = String(key).toLowerCase();
    const text = String(value);
    if (lower === "poly_address") polyHeaders.POLY_ADDRESS = text;
    if (lower === "poly_api_key") polyHeaders.POLY_API_KEY = text;
    if (lower === "poly_passphrase") polyHeaders.POLY_PASSPHRASE = text;
    if (lower === "apikey" || lower === "api_key" || lower === "api-key" || lower === "key") apiCreds.apiKey ||= text;
    if (lower === "secret" || lower === "apisecret" || lower === "api_secret" || lower === "api-secret")
      apiCreds.secret ||= text;
    if (lower === "passphrase" || lower === "apipassphrase" || lower === "api_passphrase" || lower === "api-passphrase")
      apiCreds.passphrase ||= text;
    if (lower === "baseaddress" || lower === "base_address" || lower === "base-address")
      apiCreds.baseAddress ||= text;
    if (lower === "address" || lower === "walletaddress" || lower === "maker") account.address ||= text;
    if (lower === "signaturetype" || lower === "signature_type") account.signatureType ||= text;
    if (lower === "funder" || lower === "funderaddress" || lower === "proxywallet" || lower === "proxywalletaddress")
      account.funder ||= text;
  }, 0);
}

function maybeJson(raw) {
  if (!raw) return undefined;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return undefined;
  const text = raw.trim();
  if (!text || (text[0] !== "{" && text[0] !== "[")) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function visit(value, fn, depth) {
  if (!value || typeof value !== "object" || depth > 5) return;
  if (Array.isArray(value)) {
    value.slice(0, 50).forEach(row => visit(row, fn, depth + 1));
    return;
  }
  Object.keys(value).forEach((key) => {
    const child = value[key];
    fn(key, child);
    visit(child, fn, depth + 1);
  });
}
