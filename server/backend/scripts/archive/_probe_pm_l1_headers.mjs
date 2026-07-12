#!/usr/bin/env node
/**
 * 对比 fetch vs https 转发 Polymarket L1 头（含经 http-relay）。
 * 用法：node scripts/_probe_pm_l1_headers.mjs [relayBase]
 */
import https from "node:https";

const relayBase = (process.argv[2] || "http://127.0.0.1:3456").replace(/\/+$/, "");
const targetUrl = "https://clob.polymarket.com/auth/derive-api-key";

const fakeHeaders = {
  POLY_ADDRESS: "0x0000000000000000000000000000000000000001",
  POLY_SIGNATURE: "0x" + "11".repeat(32),
  POLY_TIMESTAMP: String(Math.floor(Date.now() / 1000)),
  POLY_NONCE: "0",
};

function httpsGet(headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(targetUrl, { method: "GET", headers }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => resolve({ via: "https", status: res.statusCode, body: body.slice(0, 160) }));
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchGet(headers) {
  const res = await fetch(targetUrl, { method: "GET", headers });
  const body = await res.text();
  return { via: "fetch", status: res.status, body: body.slice(0, 160) };
}

async function relayGet(label, extraHeaders = {}) {
  const res = await fetch(`${relayBase}/esport/http-relay`, {
    method: "GET",
    headers: {
      "x-proxy-url": targetUrl,
      "x-proxy-referer": "https://polymarket.com/",
      "x-proxy-origin": "https://polymarket.com",
      ...fakeHeaders,
      ...extraHeaders,
    },
  });
  const body = await res.text();
  return { via: label, status: res.status, body: body.slice(0, 160) };
}

const arrayHeaders = Object.entries(fakeHeaders).map(([k, v]) => [k, v]);

for (const row of [
  await httpsGet(fakeHeaders),
  await httpsGet(Object.fromEntries(arrayHeaders)),
  await httpsGet({
    poly_address: fakeHeaders.POLY_ADDRESS,
    poly_signature: fakeHeaders.POLY_SIGNATURE,
    poly_timestamp: fakeHeaders.POLY_TIMESTAMP,
    poly_nonce: fakeHeaders.POLY_NONCE,
  }),
  await fetchGet(fakeHeaders),
  await relayGet("relay-upper"),
  await relayGet("relay-lower", {
    POLY_ADDRESS: undefined,
    POLY_SIGNATURE: undefined,
    POLY_TIMESTAMP: undefined,
    POLY_NONCE: undefined,
    poly_address: fakeHeaders.POLY_ADDRESS,
    poly_signature: fakeHeaders.POLY_SIGNATURE,
    poly_timestamp: fakeHeaders.POLY_TIMESTAMP,
    poly_nonce: fakeHeaders.POLY_NONCE,
  }),
]) {
  console.log(JSON.stringify(row));
}
