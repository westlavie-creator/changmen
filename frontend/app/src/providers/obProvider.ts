import type { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformProvider } from "@/providers/types";
import { accountGet, accountPostForm } from "@/utils/platformHttp";
import { md5 } from "@/utils/md5";
import { toFixed } from "@/utils/format";
import { wait } from "@/utils/wait";

const uidByAccount = new Map<number, string>();
const oddUpdateDone = new Set<number>();

function secretKey(account: PlatformAccount, timeStamp: number) {
  const uid = uidByAccount.get(account.accountId) || "";
  return md5(`${account.token}_${timeStamp}_${uid}_`);
}

function formatOdd(n: number) {
  return Number(n).toFixed(3);
}

function buildBetLine(option: BetOption, amount: number, odds: number) {
  return `mch=${option.matchId}&mkt=${option.betId}&oid=${option.itemId}&odd=${formatOdd(odds)}&a=${Math.round(amount)}&bt=1`;
}

function buildBetBody(account: PlatformAccount, option: BetOption, amount: number, odds: number) {
  const timeStamp = Math.floor(Date.now() / 1000);
  return {
    c: "1",
    "b[0]": buildBetLine(option, amount, odds),
    types: "1",
    time_stamp: String(timeStamp),
    secret_key: secretKey(account, timeStamp),
  };
}

async function ensureUid(account: PlatformAccount) {
  if (uidByAccount.has(account.accountId)) return uidByAccount.get(account.accountId)!;
  const bal = await accountGet<{ status?: string; data?: { uid?: string } }>(
    account,
    "/game/balance",
  );
  if (bal.status !== "true" || !bal.data?.uid) {
    throw new Error(String(bal.data || "game/balance failed"));
  }
  const uid = String(bal.data.uid);
  uidByAccount.set(account.accountId, uid);

  if (!oddUpdateDone.has(account.accountId)) {
    try {
      await accountGet(account, "/game/odd/updateType?odd_update_type=2");
    } catch {
      /* optional */
    }
    oddUpdateDone.add(account.accountId);
  }

  try {
    await accountGet(account, "/game/member/heartbeat");
  } catch {
    /* optional */
  }
  return uid;
}

export const obProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.gateway || !account.token) {
      throw new Error("token error");
    }
    const bal = await accountGet<{ status?: string; data?: { balance?: number; currency_en?: string } }>(
      account,
      "/game/balance",
    );
    if (bal.status !== "true") {
      throw new Error(String(bal.data || "game/balance failed"));
    }
    return {
      balance: Number(bal.data?.balance) || 0,
      currency: bal.data?.currency_en || "CNY",
    };
  },

  async checkBet(account, option) {
    if (!option.loseOrder) {
      await ensureUid(account);
      let odds = option.odds;
      const timeStamp = Math.floor(Date.now() / 1000);
      const probeBody = {
        c: "1",
        "b[0]": buildBetLine(option, 1, odds),
        types: "1",
        time_stamp: String(timeStamp),
        secret_key: secretKey(account, timeStamp),
      };
      const probe = await accountPostForm<{ status?: string; data?: string }>(
        account,
        "/game/bet",
        probeBody,
      );
      option.response = probe;

      if (probe.status !== "true") {
        const msg = String(probe.data || "");
        if (/Minimum|最小投注金额/.test(msg)) {
          /* 允许继续正式下单 */
        } else if (msg === "请勿重复提交") {
          await wait(3000);
          return this.checkBet(account, option);
        } else if (msg === "Odds error" || msg === "赔率错误") {
          option.updateOdds(Number(toFixed(odds * 0.99, 3)));
          return this.checkBet(account, option);
        } else {
          option.checkError = msg;
          return option;
        }
      }
    } else {
      await ensureUid(account);
    }

    const odds = option.odds;
    const timeStamp = Math.floor(Date.now() / 1000);
    option.data = {
      c: "1",
      "b[0]": buildBetLine(option, option.betMoney, odds),
      types: "1",
      time_stamp: String(timeStamp),
      secret_key: secretKey(account, timeStamp),
    };
    return option;
  },

  async betting(account, option) {
    await ensureUid(account);
    const oddsFromPayload = option.data?.["b[0]"]
      ? Number(String(option.data["b[0]"]).match(/odd=([\d.]+)/)?.[1])
      : NaN;
    const odds = Number.isFinite(oddsFromPayload) ? oddsFromPayload : option.odds;
    const body = buildBetBody(account, option, option.betMoney, odds);
    const res = await accountPostForm<{ status?: string; data?: string }>(
      account,
      "/game/bet",
      body,
    );
    let ok = res.status === "true";
    if (!ok && (res.data === "Odds error" || res.data === "赔率错误")) {
      option.updateOdds(Number(toFixed(odds * 0.99, 3)));
    }
    return new BetResult(account.provider, ok, ok ? "下单成功" : String(res.data || "下单失败"), body, res);
  },
};
