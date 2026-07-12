/**
 * VPS predictfun-collector 写入；浏览器经 Client_GetCollectPlatform.MarketIndex 读取。
 */
import { readJsonFile, writeJsonFile } from "./json_file_store.js";

const INDEX_NAME = "predictfun_market_index";

/** @returns {import("@changmen/api-contract").PredictFunMarketIndex | null} */
export function readPredictFunMarketIndex() {
  const raw = readJsonFile(INDEX_NAME, null);
  if (!raw || typeof raw !== "object")
    return null;
  return raw;
}

/** @param {import("@changmen/api-contract").PredictFunMarketIndex} data */
export function writePredictFunMarketIndex(data) {
  writeJsonFile(INDEX_NAME, data);
}
