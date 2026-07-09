/** [Polymarket 可证实] changmen 默认 Builder Code，与 venue-adapter/polymarket/builder.ts 一致 */
export const POLYMARKET_BUILDER_CODE_DEFAULT
  = "0x58ec38dac8719b354dfd2a47d6ac27ab01babea9102a993c1abe4af30ec2883f";

const BUILDER_CODE_RE = /^0x[0-9a-fA-F]{64}$/;

export function resolvePolymarketBuilderCode() {
  const code = String(
    process.env.POLY_BUILDER_CODE || process.env.VITE_POLY_BUILDER_CODE || POLYMARKET_BUILDER_CODE_DEFAULT,
  ).trim();
  if (!BUILDER_CODE_RE.test(code))
    throw new Error(`无效的 POLY_BUILDER_CODE: ${code.slice(0, 12)}…`);
  return code;
}
