"use strict";

const fs = require("fs");
const path = require("path");
const { getAccountBalance } = require("../account/balance_provider.js");

const kvPath = path.join(__dirname, "../data/esport/user_kv.json");
const kv = JSON.parse(fs.readFileSync(kvPath, "utf8"));
const list = JSON.parse(kv.ACCOUNT);
const ray = list.find((a) => a.provider === "RAY");

if (!ray) {
  console.error("No RAY account");
  process.exit(1);
}

console.log("gateway:", ray.gateway);
console.log("referer:", ray.referer);

getAccountBalance(ray)
  .then((r) => {
    const out = JSON.stringify({ gateway: ray.gateway, referer: ray.referer, result: r }, null, 2);
    fs.writeFileSync(path.join(__dirname, "test-out.txt"), out, "utf8");
    console.log(out);
    process.exit(r ? 0 : 2);
  })
  .catch((e) => {
    const msg = e.stack || e.message;
    fs.writeFileSync(path.join(__dirname, "test-out.txt"), msg, "utf8");
    console.error(msg);
    process.exit(1);
  });
