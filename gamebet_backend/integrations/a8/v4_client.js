"use strict";

const A8_V4_BASE = (process.env.A8_V4_URL || "https://api.a8.to/v4.0").replace(/\/+$/, "");
const { A8_FORWARD_SITE } = require("./constants.js");

function buildFormBody(fields) {
  return new URLSearchParams(fields).toString();
}

function v4Headers(extra = {}) {
  return {
    "Content-Type": "application/x-www-form-urlencoded;",
    "x-forwarded-site": process.env.A8_V4_FORWARD_SITE || A8_FORWARD_SITE,
    ...extra,
  };
}

async function requestV4(sub, { method = "POST", body = "", headers = {} } = {}) {
  const url = `${A8_V4_BASE}/${sub.replace(/^\//, "")}`;
  const init = {
    method,
    headers: v4Headers(headers),
    signal: AbortSignal.timeout(Number(process.env.A8_V4_TIMEOUT_MS || 30000)),
  };
  if (method !== "GET" && body != null) {
    init.body = body;
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`A8 v4 响应非 JSON (${res.status}): ${text.slice(0, 160)}`);
  }
  return { status: res.status, data, text };
}

async function loginV4(userName, password) {
  const { data } = await requestV4("user/account/login", {
    body: buildFormBody({ userName, password }),
  });
  return data;
}

async function playLoginV4(gameId, v4Token) {
  const { data } = await requestV4("game/play/Login", {
    body: buildFormBody({ gameId: String(gameId) }),
    headers: { token: v4Token },
  });
  return data;
}

module.exports = {
  A8_V4_BASE,
  A8_FORWARD_SITE,
  buildFormBody,
  v4Headers,
  requestV4,
  loginV4,
  playLoginV4,
};
