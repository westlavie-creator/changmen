/** [Polymarket 可证实] CLOB V2 订单归因：Builder Profile 的 bytes32 builder code */
export const POLYMARKET_BUILDER_CODE_DEFAULT
  = "0x59a473c923fab47f442e9a230daf6654fccd173afac195e8990ff5e5006e74d0";

const BUILDER_CODE_RE = /^0x[0-9a-fA-F]{64}$/;

/** 优先 `VITE_POLY_BUILDER_CODE`（构建时注入），否则用 changmen 默认 builder code */
export function resolvePolymarketBuilderCode(): string {
  const fromEnv = typeof import.meta !== "undefined"
    ? (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_POLY_BUILDER_CODE
    : undefined;
  const code = (fromEnv?.trim() || POLYMARKET_BUILDER_CODE_DEFAULT).trim();
  if (!BUILDER_CODE_RE.test(code))
    throw new Error(`无效的 Polymarket builder code（需 0x + 64 位 hex）: ${code.slice(0, 12)}…`);
  return code;
}
