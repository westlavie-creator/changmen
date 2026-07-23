import type { ApiKeyRaw, L1PolyHeader } from "@polymarket/clob-client-v2";
import { POLYMARKET_CLOB_API } from "./api";
import { normalizePolymarketPrivateKey } from "./depositWallet";
import { polymarketPluginGet, polymarketPluginPost } from "./transport";

type Hex = `0x${string}`;

export interface PolymarketApiCreds {
  apiKey: string;
  secret: string;
  passphrase: string;
}

export interface PolymarketCredentialInput {
  gateway?: string;
  walletAddress?: string;
  funder?: string;
  privateKey: string;
}

export interface PolymarketCredentialRequestOptions {
  /** changmen API 根（空 = 浏览器同源） */
  apiBase?: string;
  /** 登录 JWT；有则走服务端直连 CLOB L1（推荐生产） */
  authToken?: string;
}

export interface PolymarketDerivedCredentials {
  signerAddress: string;
  apiCreds: PolymarketApiCreds;
}

function normalizeGateway(gateway: string | undefined): string {
  const value = gateway?.trim() || POLYMARKET_CLOB_API;
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function normalizePrivateKey(raw: string): Hex {
  return normalizePolymarketPrivateKey(raw);
}

function normalizeAddress(raw: string | undefined): string {
  return raw?.trim().toLowerCase() ?? "";
}

function stringifyHeaders(headers: L1PolyHeader): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)]),
  );
}

function normalizeApiCreds(raw: ApiKeyRaw | unknown): PolymarketApiCreds | undefined {
  if (!raw || typeof raw !== "object")
    return undefined;
  const item = raw as Partial<ApiKeyRaw> & { key?: unknown };
  const apiKey = String(item.apiKey ?? item.key ?? "");
  const secret = String(item.secret ?? "");
  const passphrase = String(item.passphrase ?? "");
  if (!apiKey || !secret || !passphrase)
    return undefined;
  return { apiKey, secret, passphrase };
}

export async function createOrDerivePolymarketApiCreds(
  input: PolymarketCredentialInput,
  options?: PolymarketCredentialRequestOptions,
): Promise<PolymarketDerivedCredentials> {
  const authToken = options?.authToken?.trim();
  if (authToken) {
    const base = (options?.apiBase?.trim() || (typeof window !== "undefined" ? window.location.origin : ""))
      .replace(/\/+$/, "");
    const res = await fetch(`${base}/api/polymarket/clob/create-or-derive-api-creds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: authToken,
      },
      body: JSON.stringify({
        privateKey: input.privateKey,
        gateway: input.gateway,
        walletAddress: input.walletAddress,
      }),
    });
    const text = await res.text();
    let parsed: { error?: string; signerAddress?: string; apiCreds?: PolymarketApiCreds } = {};
    try {
      parsed = text ? JSON.parse(text) as typeof parsed : {};
    }
    catch {
      /* ignore */
    }
    if (!res.ok)
      throw new Error(parsed.error || text.trim() || `HTTP ${res.status}`);
    if (!parsed.signerAddress || !parsed.apiCreds)
      throw new Error("服务端未返回有效 Polymarket API 凭证");
    return { signerAddress: parsed.signerAddress, apiCreds: parsed.apiCreds };
  }

  const gateway = normalizeGateway(input.gateway);
  const privateKey = normalizePrivateKey(input.privateKey);
  const [
    clob,
    viem,
    accounts,
  ] = await Promise.all([
    import("@polymarket/clob-client-v2"),
    import("viem"),
    import("viem/accounts"),
  ]);

  const account = accounts.privateKeyToAccount(privateKey);
  const signerAddress = account.address;
  const expectedWallet = normalizeAddress(input.walletAddress);
  if (expectedWallet && expectedWallet !== signerAddress.toLowerCase()) {
    throw new Error(`私钥地址 ${signerAddress} 与填写的钱包地址不一致`);
  }

  const { createPolygonHttpTransport, polygonChainForRpc } = await import("./polygonRpc");
  const signer = viem.createWalletClient({
    account,
    chain: polygonChainForRpc(),
    transport: createPolygonHttpTransport(),
  });
  const headers = stringifyHeaders(await clob.createL1Headers(signer, clob.Chain.POLYGON));

  let created: PolymarketApiCreds | undefined;
  try {
    created = normalizeApiCreds(
      await polymarketPluginPost<ApiKeyRaw>(`${gateway}/auth/api-key`, undefined, { headers }),
    );
  }
  catch {
    created = undefined;
  }
  if (created)
    return { signerAddress, apiCreds: created };

  const derived = normalizeApiCreds(
    await polymarketPluginGet<ApiKeyRaw>(`${gateway}/auth/derive-api-key`, { headers }),
  );
  if (!derived)
    throw new Error("Polymarket 未返回有效 API 凭证");
  return { signerAddress, apiCreds: derived };
}
