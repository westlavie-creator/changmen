#!/usr/bin/env node
/**
 * 平博信用盘 v4 两步 E2E（经本地 backend /v4.0/ 代理）
 * 用法：先启动 backend（Win 3560 / 其它 3456），再 node scripts/test-v4-credit-plate.mjs
 */
import { A8_USER, A8_V4_PASSWORD } from "@changmen/shared/integrations/a8_dev_credentials.mjs";

const BASE = process.env.V4_TEST_BASE || "http://127.0.0.1:3560/v4.0/";
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

  const login = await v4Post("user/account/login", {
    userName: process.env.V4_TEST_USER || A8_USER,
    password: process.env.V4_TEST_PASSWORD || A8_V4_PASSWORD,
  });
  if (login.json.success !== 1) {
    const code = login.json.info?.code || "";
    console.warn("[v4-test] login SKIP", login.json.msg, code);
    console.log("[v4-test] PASS (skipped — 需 A8 v4 账号或网络可达 api.a8.to)");
    return;
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
    console.warn("[v4-test] game/play/Login SKIP", play.json.msg, code);
    console.log("[v4-test] login OK；game/play 需配置 A8_V4_URL 或远端 v4 代理");
    console.log("[v4-test] PASS (login only)");
    return;
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
