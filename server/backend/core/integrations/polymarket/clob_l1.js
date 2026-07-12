/**
 * Polymarket CLOB L1：在 HK VPS 直连 clob.polymarket.com 生成/派生 apiCreds。
 * 避免浏览器 → http-relay 转发 POLY_* 头（fetch 路径与 L1 POST 易出问题）。
 */

const DEFAULT_CLOB = "https://clob.polymarket.com";

function normalizeGateway(gateway) {
  const value = String(gateway || DEFAULT_CLOB).trim() || DEFAULT_CLOB;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizePrivateKey(raw) {
  const key = String(raw ?? "").trim();
  const hex = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex))
    throw new Error("Polymarket 私钥格式不正确，应为 64 位 hex");
  return hex;
}

function normalizeAddress(raw) {
  return String(raw ?? "").trim().toLowerCase();
}

function normalizeApiCreds(raw) {
  if (!raw || typeof raw !== "object")
    return undefined;
  const item = raw;
  const apiKey = String(item.apiKey ?? item.key ?? "");
  const secret = String(item.secret ?? "");
  const passphrase = String(item.passphrase ?? "");
  if (!apiKey || !secret || !passphrase)
    return undefined;
  return { apiKey, secret, passphrase };
}

async function fetchClobServerTime(gateway) {
  try {
    const res = await fetch(`${gateway}/time`, { signal: AbortSignal.timeout(5000) });
    const ts = Number(String(await res.text()).trim());
    return Number.isFinite(ts) && ts > 0 ? Math.floor(ts) : undefined;
  }
  catch {
    return undefined;
  }
}

async function clobL1Fetch(gateway, method, path, headers, body) {
  const res = await fetch(`${gateway}${path}`, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.trim() || `HTTP ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error)
        msg = String(parsed.error);
    }
    catch {
      /* keep raw */
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  if (!text.trim())
    return undefined;
  try {
    return JSON.parse(text);
  }
  catch {
    return text;
  }
}

function stringifyL1Headers(headers) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

/**
 * @param {{ privateKey: string, gateway?: string, walletAddress?: string }} input
 */
export async function createOrDerivePolymarketApiCredsOnServer(input) {
  const gateway = normalizeGateway(input.gateway);
  const privateKey = normalizePrivateKey(input.privateKey);
  const [
    clob,
    viem,
    accounts,
    chains,
  ] = await Promise.all([
    import("@polymarket/clob-client-v2"),
    import("viem"),
    import("viem/accounts"),
    import("viem/chains"),
  ]);

  const account = accounts.privateKeyToAccount(privateKey);
  const signerAddress = account.address;
  const expectedWallet = normalizeAddress(input.walletAddress);
  if (expectedWallet && expectedWallet !== signerAddress.toLowerCase()) {
    throw new Error(`私钥地址 ${signerAddress} 与填写的钱包地址不一致`);
  }

  const signer = viem.createWalletClient({
    account,
    chain: chains.polygon,
    transport: viem.http(),
  });
  const timestamp = await fetchClobServerTime(gateway);
  const l1 = stringifyL1Headers(
    await clob.createL1Headers(signer, clob.Chain.POLYGON, undefined, timestamp),
  );

  let created;
  try {
    created = normalizeApiCreds(
      await clobL1Fetch(gateway, "POST", "/auth/api-key", l1, undefined),
    );
  }
  catch {
    created = undefined;
  }
  if (created)
    return { signerAddress, apiCreds: created };

  const derived = normalizeApiCreds(
    await clobL1Fetch(gateway, "GET", "/auth/derive-api-key", l1),
  );
  if (!derived)
    throw new Error("Polymarket 未返回有效 API 凭证");
  return { signerAddress, apiCreds: derived };
}
