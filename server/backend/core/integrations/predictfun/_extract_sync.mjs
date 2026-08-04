import fs from "fs";

const src = fs.readFileSync("pf_client_handlers.js", "utf8");
const start = src.indexOf("用官方状态写回 RDS");
const end = src.indexOf("export async function settleResolvedPfOrdersForPlayer");
if (start < 0 || end < 0) {
  console.error("markers", start, end);
  process.exit(1);
}
// include the /** before the Chinese comment
const docStart = src.lastIndexOf("/**", start);
const body = src.slice(docStart, end);
const header = `/**
 * 官网状态 → RDS 写回（拒单退款 / 成交确认 / 迟到 fee）
 * 编排层：pf_client_handlers；账本：pf_player_account；行字段：pf_order_row
 */

import * as accountStore from "../../account/account_store.js";
import * as orderStore from "../../account/order_store.js";
import {
  changmenCodeFeeSavePatch,
  readChangmenCodeFeeRateBps,
  readChangmenCodeFeeShares,
  readChangmenCodeFeeUsdt,
} from "./pf_changmen_code_fee.js";
import { resolvePfChangmenBuyFeeRateBps, resolvePfChangmenSellFeeRateBps } from "./house_credentials.js";
import { roundUsdt } from "./pf_ledger.js";
import { readPfLedgerState } from "./pf_lifecycle.js";
import {
  applyPendingPfLedgerCredit,
  loadPfOrders,
  publishPfBalanceKnown,
} from "./pf_player_account.js";
import {
  rdsAlreadyRefunded,
  rdsBetMoney,
  rdsOrderKey,
  rdsOrderStatus,
  rdsPfApiOrderId,
  rdsPfHash,
  rdsToMapInput,
} from "./pf_order_row.js";
import { extractBuyFillCostUsdt, extractBuyFillShares, extractBuyNotionalUsdt, extractSellFill } from "./pf_fill.js";
import {
  applyChangmenBuyFeeToHoldShares,
  netSellProceedsAfterChangmenFee,
  netSellProceedsAfterCollateralFee,
  resolvePfFeeSavePatch,
} from "./pf_fee.js";
import {
  fetchHousePredictOrderResolved,
  hasWalletFeeSignal,
  isOpenChangmenOrderStatus,
  mapPredictOrderToVenueOrder,
  settlementFromPredictOfficialStatus,
} from "./pf_orders.js";
import { withHouseOrderLock } from "./pf_order_service.js";

`;
const exported = body
  .replace("async function syncOfficialOrderToRds", "export async function syncOfficialOrderToRds")
  .replace("async function lookupOfficialOrder", "export async function lookupOfficialOrder");
fs.writeFileSync("pf_sync_official.js", header + exported);
console.log("ok bytes", (header + exported).length, "from", docStart, "to", end);

