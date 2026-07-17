#!/usr/bin/env node
/**
 * v4 信用盘已停用 — 断言 /v4.0/ 返回 V4Disabled，不再打 api.a8.to。
 * 用法：先启动 backend，再 node scripts/test-v4-credit-plate.mjs
 */
const BASE = process.env.V4_TEST_BASE || "http://127.0.0.1:3560/v4.0/";

async function v4Post(path, body = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  }
  catch {
    throw new Error(`非 JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return { status: res.status, json };
}

async function main() {
  console.log("[v4-test] base:", BASE);
  const login = await v4Post("user/account/login", { userName: "x", password: "y" });
  if (login.json.success !== 0 || login.json.info?.code !== "V4Disabled") {
    console.error("[v4-test] FAIL: expected V4Disabled", login.json);
    process.exit(1);
  }
  console.log("[v4-test] PASS — v4 disabled:", login.json.msg);
}

main().catch((err) => {
  console.error("[v4-test] FAIL", err);
  process.exit(1);
});
