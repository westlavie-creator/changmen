/** [Polymarket 可证实] changmen 默认 Builder Code，与 venue-adapter/polymarket/builder.ts 一致 */
export const POLYMARKET_BUILDER_CODE_DEFAULT
  = "0x59a473c923fab47f442e9a230daf6654fccd173afac195e8990ff5e5006e74d0";

const BUILDER_CODE_RE = /^0x[0-9a-fA-F]{64}$/;

export function resolvePolymarketBuilderCode() {
  const code = String(
    process.env.POLY_BUILDER_CODE || process.env.VITE_POLY_BUILDER_CODE || POLYMARKET_BUILDER_CODE_DEFAULT,
  ).trim();
  if (!BUILDER_CODE_RE.test(code))
    throw new Error(`无效的 POLY_BUILDER_CODE: ${code.slice(0, 12)}…`);
  return code;
}
