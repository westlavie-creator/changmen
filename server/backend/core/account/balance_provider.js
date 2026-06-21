import store from "../esport-api/store.js";
import { requirePlatform } from "../shared/adapter_paths.js";
import { rayApiPath } from "../shared/ray_paths.js";

const {
  fetchBalance: fetchPbBalance,
  parsePbTokenBalance,
  tryLoadSession: tryPbSession,
} = requirePlatform("PB", "node", "session.js");
const {
  fetchBalance: fetchHgBalance,
  tryLoadSession: tryHgSession,
} = requirePlatform("HG", "node", "session.js");
const { obGet } = requirePlatform("OB", "node", "session.js");
const { rayGet } = requirePlatform("RAY", "node", "session.js");
const { DEFAULT_GATEWAYS } = requirePlatform("RAY", "node", "core.js");

function originFromReferer(referer) {
  if (!referer)
    return undefined;
  try {
    return new URL(referer).origin;
  }
  catch {
    return String(referer).replace(/\/+$/, "");
  }
}

/**
 * 按账号凭证拉余额，供 uv.updateBalance() 对齐�? * 未接入的 provider 返回 null，前端会显示余额未知�?
 */
export async function getAccountBalance(account) {
  if (!account?.provider)
    return null;

  const session = accountToSession(account);
  if (!session)
    return null;

  switch (String(account.provider).toUpperCase()) {
    case "PB": {
      const multiply = Math.max(1, Number(account.multiply) || 1);
      const bal = await fetchPbBalance(session, { multiply });
      return { balance: bal.balance, currency: normalizeCurrency(bal.currency) };
    }
    case "HG": {
      const bal = await fetchHgBalance(session);
      return { balance: bal.balance, currency: normalizeCurrency(bal.currency) };
    }
    case "OB": {
      const res = await obGet(session.gateway, "/game/balance", session.token, "cn");
      if (res.json?.status !== "true") {
        throw new Error(String(res.json?.data || "game/balance failed"));
      }
      return {
        balance: Number(res.json.data?.balance) || 0,
        currency: normalizeCurrency(res.json.data?.currency_en),
      };
    }
    case "RAY": {
      const origin = originFromReferer(session.referer);
      const gateways = [
        session.gateway,
        ...DEFAULT_GATEWAYS.filter(g => g !== session.gateway),
      ];
      let lastErr;
      for (const gw of gateways) {
        if (!gw)
          continue;
        try {
          const apiPath = rayApiPath(gw, "user");
          const r = await rayGet(gw, apiPath, session.token, origin);
          const json = r.json;
          if (!json || json.code !== 200) {
            throw new Error(json?.desc || json?.message || "v2/user failed");
          }
          return {
            balance: Number(json.result?.balance) || 0,
            currency: normalizeCurrency(json.result?.currency),
          };
        }
        catch (err) {
          lastErr = err;
        }
      }
      throw lastErr || new Error("v2/user failed");
    }
    default:
      return null;
  }
}

function normalizeCurrency(code) {
  const c = String(code || "CNY").toUpperCase();
  if (c === "USD" || c === "USDT")
    return "USDT";
  return "CNY";
}

export function accountToSession(account) {
  if (!account?.gateway || !account?.token)
    return null;
  return {
    gateway: account.gateway,
    token: account.token,
    referer: account.referer || account.gateway,
    userAgent: account.userAgent || "",
    cookie: account.cookie || "",
  };
}

/**
 * �?platforms.json / 环境变量里已有同 provider 凭证，可给空 token 账号补全�?
 */
export function enrichAccountFromPlatformDefaults(account) {
  if (!account?.provider)
    return account;
  const provider = String(account.provider).toUpperCase();
  if (account.gateway && account.token)
    return account;

  if (provider === "PB") {
    const session = tryPbSession();
    if (session) {
      return {
        ...account,
        gateway: account.gateway || session.gateway,
        token: account.token || session.token,
        referer: account.referer || session.referer,
        userAgent: account.userAgent || session.userAgent,
      };
    }
  }

  if (provider === "HG") {
    const session = tryHgSession();
    if (session) {
      return {
        ...account,
        gateway: account.gateway || session.gateway,
        token: account.token || session.token,
      };
    }
  }

  const row = store.getPlatform(provider);
  if (row?.gateway && row?.token) {
    return {
      ...account,
      gateway: account.gateway || row.gateway,
      token: account.token || row.token,
      referer: account.referer || row.referer || row.gateway,
    };
  }

  return account;
}

export { parsePbTokenBalance };
