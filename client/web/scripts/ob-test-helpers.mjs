#!/usr/bin/env node
/**
 * OB 联调脚本共用：登录 /esport、读取 a8_constants 默认账号
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { A8_USER, A8_PASSWORD } = require("../../backend/core/integrations/a8/constants.js");

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function resolveEsportBase() {
  const base =
    process.env.ESPORT_TEST_BASE ||
    process.env.V4_TEST_BASE?.replace(/\/v4\.0\/?$/, "") ||
    "http://127.0.0.1:3560";
  return base.replace(/\/$/, "");
}

export function defaultCredentials() {
  return {
    userName: process.env.ESPORT_TEST_USER || A8_USER,
    password: process.env.ESPORT_TEST_PASSWORD || A8_PASSWORD,
  };
}

export async function esportPost(base, action, body, { token = "", query = "" } = {}) {
  const url = `${base}/esport/${action}${query}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.token = token;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} 非 JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return { status: res.status, json };
}

export async function loginEsport(base, creds = defaultCredentials()) {
  const { json } = await esportPost(base, "Client_Login", creds);
  assert(json.success === 1 && json.info?.token, `登录失败: ${json.msg || "无 token"}`);
  return { token: json.info.token, userName: creds.userName };
}
