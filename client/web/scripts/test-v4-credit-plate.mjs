#!/usr/bin/env node
/**
 * 平博信用盘 v4 两步 E2E（经本地 backend /v4.0/ 代理）
 * 用法：先启动 gamebet_backend:3456，再 node scripts/test-v4-credit-plate.mjs
 */
const BASE = process.env.V4_TEST_BASE || "http://127.0.0.1:3456/v4.0/";
const FORWARD_SITE = "game.haijings.vip";
const GAME_ID = 3;

async function v4Post(path, body, token = "") {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded;",
    "x-forwarded-site": FORWARD_SITE,
  };
  if (token) headers.token = token;
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`非 JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return { status: res.status, json };
}

async function main() {
  console.log("[v4-test] base:", BASE);

  const login = await v4Post("user/account/login", {});
  if (login.json.success !== 1) {
    const code = login.json.info?.code || "";
    console.error("[v4-test] login FAIL", login.json.msg, code);
    process.exit(1);
  }
  const token =
    login.json.info?.token ?? login.json.info?.Token ?? "";
  if (!token) {
    console.error("[v4-test] login: 无 token");
    process.exit(1);
  }
  console.log("[v4-test] login OK, token length:", token.length);

  const play = await v4Post("game/play/Login", { gameId: GAME_ID }, token);
  if (play.json.success !== 1) {
    const code = play.json.info?.code || "";
    console.error("[v4-test] game/play/Login FAIL", play.json.msg, code);
    process.exit(1);
  }
  const url = (play.json.info?.Url ?? play.json.info?.url ?? "").trim();
  if (!url || url === "about:blank") {
    console.error("[v4-test] play: 无 Url", play.json);
    process.exit(1);
  }
  console.log("[v4-test] game/play/Login OK");
  console.log("[v4-test] Url:", url.slice(0, 120) + (url.length > 120 ? "…" : ""));
  console.log("[v4-test] PASS");
}

main().catch((e) => {
  console.error("[v4-test] ERROR", e.message);
  process.exit(1);
});
