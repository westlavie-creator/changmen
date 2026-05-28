"use strict";

const crypto = require("crypto");
const { login, obGet, obPost } = require("./ob_session.js");

const uidByToken = new Map();
const oddUpdateDone = new Set();

function md5(text) {
  return crypto.createHash("md5").update(String(text)).digest("hex");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function secretKey(session, timeStamp, uid) {
  return md5(`${session.token}_${timeStamp}_${uid}_`);
}

function formatOdd(n) {
  return Number(n).toFixed(3);
}

function buildBetLine(ref, amount, odds) {
  return `mch=${ref.matchId}&mkt=${ref.marketId}&oid=${ref.oddsId}&odd=${formatOdd(odds)}&a=${Math.round(amount)}&bt=1`;
}

function buildBetBody(session, ref, amount, odds, uid) {
  const timeStamp = Math.floor(Date.now() / 1000);
  return {
    c: "1",
    "b[0]": buildBetLine(ref, amount, odds),
    types: "1",
    time_stamp: String(timeStamp),
    secret_key: secretKey(session, timeStamp, uid),
  };
}

async function ensureUid(session) {
  if (uidByToken.has(session.token)) {
    return uidByToken.get(session.token);
  }
  const bal = await obGet(session.gateway, "/game/balance", session.token, session.lang);
  if (bal.json.status !== "true" || !bal.json.data?.uid) {
    throw new Error(bal.json.data || "game/balance failed");
  }
  const uid = String(bal.json.data.uid);
  uidByToken.set(session.token, uid);

  if (!oddUpdateDone.has(session.token)) {
    try {
      await obGet(
        session.gateway,
        "/game/odd/updateType?odd_update_type=2",
        session.token,
        session.lang
      );
    } catch {
      /* optional */
    }
    oddUpdateDone.add(session.token);
  }

  try {
    await obGet(session.gateway, "/game/member/heartbeat", session.token, session.lang);
  } catch {
    /* optional */
  }

  return uid;
}

async function getSession() {
  return login();
}

/**
 * OB 预检下单（A8 vYe.checkBet：先 a=1 探针）
 * @param {object} betRef
 * @param {number} amount
 * @param {{ _retries?: number }} [meta]
 */
async function checkBet(betRef, amount, meta = {}) {
  const retries = meta._retries ?? 0;
  if (retries > 5) {
    return { ok: false, platform: "OB", error: "check retries exceeded", amount: Math.round(amount) };
  }
  const session = await getSession();
  const uid = await ensureUid(session);
  const odds = Number(betRef.odds);
  let workingOdds = odds;

  const probeBody = buildBetBody(session, betRef, 1, workingOdds, uid);
  const probe = await obPost(session.gateway, "/game/bet", session.token, session.lang, probeBody);
  const probeData = probe.json?.data;

  if (probe.json.status === "true") {
    const payload = buildBetBody(session, betRef, amount, workingOdds, uid);
    return {
      ok: true,
      platform: "OB",
      odds: workingOdds,
      amount: Math.round(amount),
      payload,
      probe: probe.json,
      balance: null,
    };
  }

  if (/Minimum|最小投注金额/.test(String(probeData))) {
    const payload = buildBetBody(session, betRef, amount, workingOdds, uid);
    return {
      ok: true,
      platform: "OB",
      odds: workingOdds,
      amount: Math.round(amount),
      payload,
      probe: probe.json,
      warning: String(probeData),
    };
  }

  if (probeData === "请勿重复提交") {
    await sleep(3000);
    return checkBet(betRef, amount, { _retries: retries + 1 });
  }

  if (probeData === "Odds error" || probeData === "赔率错误") {
    workingOdds = Math.floor(workingOdds * 0.99 * 1000) / 1000;
    return checkBet({ ...betRef, odds: workingOdds }, amount, { _retries: retries + 1 });
  }

  return {
    ok: false,
    platform: "OB",
    odds: workingOdds,
    amount: Math.round(amount),
    error: String(probeData || probe.json?.msg || "check failed"),
    probe: probe.json,
  };
}

/**
 * OB 正式下单（A8 vYe.betting）
 * 使用 check 返回的赔率，但重建 time_stamp / secret_key（避免用户确认延迟导致失效）
 */
async function placeBet(betRef, amount, payload) {
  const session = await getSession();
  const uid = await ensureUid(session);
  const oddsFromPayload = payload?.["b[0]"]
    ? Number(String(payload["b[0]"]).match(/odd=([\d.]+)/)?.[1])
    : NaN;
  const odds = Number.isFinite(oddsFromPayload) ? oddsFromPayload : Number(betRef.odds);
  const body = buildBetBody(session, betRef, amount, odds, uid);

  const res = await obPost(session.gateway, "/game/bet", session.token, session.lang, body);
  const dataMsg = res.json?.data;
  let ok = res.json?.status === "true";
  let adjustedOdds = odds;

  if (!ok && (dataMsg === "Odds error" || dataMsg === "赔率错误")) {
    adjustedOdds = Math.floor(adjustedOdds * 0.99 * 1000) / 1000;
  }

  return {
    ok,
    platform: "OB",
    message: ok ? "下单成功" : String(dataMsg || "下单失败"),
    odds: adjustedOdds,
    amount: Math.round(amount),
    raw: res.json,
    httpStatus: res.status,
  };
}

module.exports = {
  checkBet,
  placeBet,
  getSession,
  ensureUid,
};
