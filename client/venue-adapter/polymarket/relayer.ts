import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { RelayClient, RelayerTxType, type Transaction } from "@polymarket/builder-relayer-client";
import { encodeFunctionData, maxUint256, type Hex } from "viem";

type SignatureType = string | number | undefined;

export interface PolymarketRelayerPrepareInput {
  privateKey: string;
  /** 远程签名 URL，如 `${apiBase}/api/polymarket/relayer/sign` */
  signUrl: string;
  /** 用户 JWT，作为 remoteBuilderConfig.token（Bearer） */
  authToken: string;
  relayerUrl?: string;
  signatureType?: SignatureType;
}

export interface PolymarketRelayerPrepareResult {
  ok: boolean;
  message: string;
  transactionHash?: string;
  skipped?: boolean;
}

/**
 * [Polymarket 可证实] Polygon 主网合约。
 * V1 Exchange 仍保留（存量授权/兼容）；V2 为当前 CLOB 交易 spender。
 * @see https://docs.polymarket.com/resources/contracts
 * @see https://docs.polymarket.com/market-makers/getting-started
 */
export const POLYGON_POLYMARKET = {
  /** 旧 collateral（USDC.e）；部分钱包/路径仍用 */
  USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  /** CLOB V2 collateral（pUSD） */
  PUSD: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  CTF: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  CTF_EXCHANGE_V1: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
  NEG_RISK_EXCHANGE_V1: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
  CTF_EXCHANGE: "0xE111180000d2663C0091e4f400237545B87B996B",
  NEG_RISK_EXCHANGE: "0xe2222d279d744050d28e00520010520000310F59",
  NEG_RISK_ADAPTER: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
} as const;

/** @deprecated 用 POLYGON_POLYMARKET；保留别名避免外部 import 断裂 */
const POLYGON = POLYGON_POLYMARKET;

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const ERC1155_SET_APPROVAL_FOR_ALL_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

const DEFAULT_RELAYER_URL = "https://relayer-v2.polymarket.com";
const POLYGON_CHAIN_ID = 137;

function normalizePrivateKey(raw: string): Hex {
  const key = raw.trim();
  const hex = key.startsWith("0x") ? key : `0x${key}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex))
    throw new Error("Polymarket 私钥格式不正确，应为 64 位 hex");
  return hex as Hex;
}

function resolveRelayerTxType(signatureType: SignatureType): RelayerTxType {
  const numeric = Number(signatureType ?? 3);
  return numeric === 3 ? RelayerTxType.PROXY : RelayerTxType.SAFE;
}

function createApproveTransaction(tokenAddress: string, spenderAddress: string): Transaction {
  return {
    to: tokenAddress,
    data: encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [spenderAddress as Hex, maxUint256],
    }),
    value: "0",
  };
}

/** 卖单：一次授权全部 outcome token（不必按 tokenId） */
function createSetApprovalForAllTransaction(operatorAddress: string): Transaction {
  return {
    to: POLYGON.CTF,
    data: encodeFunctionData({
      abi: ERC1155_SET_APPROVAL_FOR_ALL_ABI,
      functionName: "setApprovalForAll",
      args: [operatorAddress as Hex, true],
    }),
    value: "0",
  };
}

/** 买卖共用的 Exchange / Adapter spender（V1+V2） */
export function polymarketTradeSpenders(): readonly string[] {
  return [
    POLYGON.CTF_EXCHANGE_V1,
    POLYGON.NEG_RISK_EXCHANGE_V1,
    POLYGON.CTF_EXCHANGE,
    POLYGON.NEG_RISK_EXCHANGE,
    POLYGON.NEG_RISK_ADAPTER,
  ];
}

/**
 * 钱包准备：买（collateral approve）+ 卖（CTF setApprovalForAll）。
 * 每个 spender 一次即可，覆盖全部市场 token。
 */
export function buildStandardApprovalTransactions(): Transaction[] {
  const spenders = polymarketTradeSpenders();
  const txs: Transaction[] = [
    // 买：USDC.e → CTF（split）+ 各 Exchange
    createApproveTransaction(POLYGON.USDC, POLYGON.CTF),
    // 买：pUSD → CTF + 各 Exchange（CLOB V2）
    createApproveTransaction(POLYGON.PUSD, POLYGON.CTF),
  ];
  for (const spender of spenders) {
    txs.push(createApproveTransaction(POLYGON.USDC, spender));
    txs.push(createApproveTransaction(POLYGON.PUSD, spender));
    // 卖：CTF 授权 Exchange 动用全部 outcome token
    txs.push(createSetApprovalForAllTransaction(spender));
  }
  return txs;
}

function joinSignUrl(signUrl: string): string {
  const url = signUrl.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://"))
    throw new Error("Relayer 远程签名 URL 必须是绝对地址");
  return url;
}

function formatRelayerError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { data?: { error?: string } };
    const detail = parsed?.data?.error;
    if (detail?.includes("does not match auth")) {
      return "Relayer 鉴权地址与账号私钥不一致：Relayer API Key 仅适用于 key 绑定地址 = 私钥地址；changmen 多用户请用服务端 POLY_BUILDER_*（Builder HMAC）";
    }
    if (detail)
      return detail;
  }
  catch {
    /* not JSON */
  }
  return raw || "Polymarket Relayer 请求失败";
}

export async function preparePolymarketWallet(
  input: PolymarketRelayerPrepareInput,
): Promise<PolymarketRelayerPrepareResult> {
  try {
    return await preparePolymarketWalletInner(input);
  }
  catch (err) {
    return { ok: false, message: formatRelayerError(err) };
  }
}

async function preparePolymarketWalletInner(
  input: PolymarketRelayerPrepareInput,
): Promise<PolymarketRelayerPrepareResult> {
  const privateKey = normalizePrivateKey(input.privateKey);
  const signUrl = joinSignUrl(input.signUrl);
  const authToken = input.authToken.trim();
  if (!authToken)
    return { ok: false, message: "未登录，无法调用 Relayer 远程签名" };

  const relayerUrl = (input.relayerUrl?.trim() || DEFAULT_RELAYER_URL).replace(/\/+$/, "");
  const relayTxType = resolveRelayerTxType(input.signatureType);

  const [
    accounts,
    chains,
    viem,
  ] = await Promise.all([
    import("viem/accounts"),
    import("viem/chains"),
    import("viem"),
  ]);

  const account = accounts.privateKeyToAccount(privateKey);
  const wallet = viem.createWalletClient({
    account,
    chain: chains.polygon,
    transport: viem.http(),
  });

  const builderConfig = new BuilderConfig({
    remoteBuilderConfig: {
      url: signUrl,
      token: authToken,
    },
  });

  const client = new RelayClient(
    relayerUrl,
    POLYGON_CHAIN_ID,
    wallet,
    builderConfig,
    relayTxType,
  );

  const transactions = buildStandardApprovalTransactions();
  const response = await client.execute(transactions, "changmen polymarket wallet prep buy+sell");
  const result = await response.wait();
  if (!result?.transactionHash) {
    return {
      ok: false,
      message: "Relayer 链上授权未完成（可能 Relayer 未配置或交易失败）",
    };
  }
  return {
    ok: true,
    message: "Polymarket 链上授权已完成（Relayer 免 gas）",
    transactionHash: result.transactionHash,
  };
}

export async function fetchPolymarketRelayerStatus(
  apiBase: string,
  authToken: string,
): Promise<{ configured: boolean; relayerUrl?: string }> {
  const base = apiBase.replace(/\/+$/, "");
  const url = `${base}/api/polymarket/relayer/status`;
  const res = await fetch(url, {
    headers: {
      token: authToken,
      Accept: "application/json",
    },
  });
  if (!res.ok)
    return { configured: false };
  return res.json() as Promise<{ configured: boolean; relayerUrl?: string }>;
}
