import fs from "node:fs";

const c = fs.readFileSync(
  "d:/River/arb/gamebet/A8/A8frontendscipts/2.0.1/index.js",
  "utf8",
);

const keys = [
  "saveOrderBind",
  "SaveOrderBind",
  "linkId",
  "updateOrders",
  "saveOrders",
  "isVenueReject",
  "Cke",
  "lBe",
  "nA(",
  "vx(",
  "LinkID",
  "groupBy(T",
  "getOrders",
  "ZT",
  "orderList",
];

for (const k of keys) {
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`.{0,600}${esc}.{0,600}`, "g");
  const matches = [...c.matchAll(re)].slice(0, 3);
  console.log(`\n=== ${k} (${matches.length} shown) ===`);
  for (const m of matches) {
    console.log("---");
    console.log(m[0]);
  }
}
