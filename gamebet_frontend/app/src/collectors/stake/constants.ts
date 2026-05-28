/** 对齐 A8 bundle `Y0` — USDT 余额/金额 → CNY 展示 */
export const STAKE_USDT_TO_CNY = 6.977023058793687;

export const STAKE_GRAPHQL_PATH = "/_api/graphql";

/** 对齐 A8 `YZe()` — 采集 GraphQL 请求头（无 x-access-token） */
export const STAKE_COLLECT_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "x-language": "zh",
  "x-operation-name": "CurrencyConfiguration",
  "x-operation-type": "query",
};
