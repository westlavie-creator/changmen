/**
 * [Polymarket 可证实] Polygon 主网合约。
 * @see https://docs.polymarket.com/resources/contracts
 */
export const POLYGON_POLYMARKET = {
  USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  PUSD: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  CTF: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  /** 已下线；Deposit Wallet relayer 会拒绝 approve 到此地址（not in the allowed list） */
  CTF_EXCHANGE_V1: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
  /** 已下线；同上，勿放入授权 batch */
  NEG_RISK_EXCHANGE_V1: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
  CTF_EXCHANGE: "0xE111180000d2663C0091e4f400237545B87B996B",
  NEG_RISK_EXCHANGE: "0xe2222d279d744050d28e00520010520000310F59",
  NEG_RISK_ADAPTER: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
} as const;

/**
 * 买卖共用的 Exchange / Adapter spender（仅 CLOB V2）。
 * Deposit Wallet 对 approve spender 有白名单，V1 Exchange 不在名单内。
 */
export function polymarketTradeSpenders(): readonly string[] {
  return [
    POLYGON_POLYMARKET.CTF_EXCHANGE,
    POLYGON_POLYMARKET.NEG_RISK_EXCHANGE,
    POLYGON_POLYMARKET.NEG_RISK_ADAPTER,
  ];
}
