"use strict";

function emptyPage() {
  return { list: [], total: 0, pageIndex: 1, pageSize: 20 };
}

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

function monthReport(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const [year, mon] = m.split("-").map(Number);
  const days = new Date(year, mon, 0).getDate();
  const list = [];
  for (let day = 1; day <= days; day += 1) {
    list.push(emptyReportRow(new Date(year, mon - 1, day)));
  }
  const total = {
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
  return { month: m, list, total };
}

module.exports = { emptyPage, monthReport };
