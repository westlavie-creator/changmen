import * as sb from "@changmen/db";
import { toDateKey } from "./order_store.js";

function emptyReportRow(date) {
  return {
    Date: date instanceof Date ? date.toISOString() : String(date),
    Profit: 0,
    OrderCount: 0,
    BetMoney: 0,
    Rate: 0,
    Hacked: 0,
    RealProfit: 0,
    Deposit: 0,
    Withdraw: 0,
    Wallet: 0,
  };
}

function monthBounds(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const [year, mon] = m.split("-").map(Number);
  if (!year || !mon) {
    const now = new Date();
    return monthBounds(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  }
  const days = new Date(year, mon, 0).getDate();
  return { month: m, year, mon, days };
}

function dateKeyForDay(year, mon, day) {
  return `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 利润率、充提差、实际利润（利润 − 被黑）[changmen 推测] */
function finalizeRow(row) {
  row.Rate = row.BetMoney > 0 ? row.Profit / row.BetMoney : 0;
  row.Wallet = row.Deposit - row.Withdraw;
  row.RealProfit = row.Profit - row.Hacked;
  return row;
}

/** 全站月报：orders 表 + money_logs 表 */
export async function getMonthReport(month) {
  const { month: m, year, mon, days } = monthBounds(month);
  const byDate = new Map();
  for (let day = 1; day <= days; day += 1) {
    const key = dateKeyForDay(year, mon, day);
    byDate.set(key, emptyReportRow(new Date(year, mon - 1, day)));
  }

  const orders = await sb.fetchOrdersForMonthAggregate(m);
  for (const o of orders || []) {
    if (String(o.status || "") === "Reject") continue;
    const key = toDateKey(o.create_at);
    const row = byDate.get(key);
    if (!row) continue;
    row.Profit += Number(o.money) || 0;
    row.BetMoney += Number(o.bet_money) || 0;
    row.OrderCount += 1;
  }

  for (const log of await sb.fetchAllMoneyLogs()) {
    const key = toDateKey(log.create_at);
    const row = byDate.get(key);
    if (!row) continue;
    const money = Number(log.money) || 0;
    const type = String(log.type || "");
    if (type === "Recharge") row.Deposit += money;
    else if (type === "Withdraw") row.Withdraw += money;
    else if (type === "Lose") row.Hacked += money;
  }

  const list = [];
  const total = emptyReportRow("total");
  const sumKeys = ["Profit", "OrderCount", "BetMoney", "Hacked", "Deposit", "Withdraw"];
  for (let day = 1; day <= days; day += 1) {
    const key = dateKeyForDay(year, mon, day);
    const row = finalizeRow(byDate.get(key));
    list.push(row);
    for (const k of sumKeys) total[k] += row[k];
  }
  finalizeRow(total);
  return { month: m, list, total };
}
