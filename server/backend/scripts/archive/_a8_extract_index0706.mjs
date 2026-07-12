#!/usr/bin/env node
import fs from "node:fs";

const path = "D:/River/arb/changmen/A8/index0706.js";
const c = fs.readFileSync(path, "utf8");

const needles = [
  "拒单检测",
  "waitTime[",
  "saveOrderBind",
  "updateOrders()",
  "updateBalance()",
  "await ft.wait(1e3)",
  "await dt.wait(1e3)",
  "wait(100)",
  "countdown",
  "isCreateOrder",
  "createOrder(re)",
  "BettingMessage",
  "finally{",
  "for(let",
];

for (const k of needles) {
  const positions = [];
  let idx = 0;
  while ((idx = c.indexOf(k, idx)) !== -1 && positions.length < 5) {
    positions.push(idx);
    idx += k.length;
  }
  console.log(`\n=== ${k} (${positions.length} hits, first ${Math.min(3, positions.length)} shown) ===`);
  for (const pos of positions.slice(0, 3)) {
    const start = Math.max(0, pos - 400);
    const end = Math.min(c.length, pos + 800);
    console.log("---");
    console.log(c.slice(start, end).replace(/\n/g, " "));
  }
}
