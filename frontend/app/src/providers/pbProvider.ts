import { BetResult } from "@/models/betResult";
import type { PlatformProvider } from "@/providers/types";
import { accountPostText } from "@/utils/platformHttp";
import { buildPbAuthHeaders } from "@/utils/pbHeaders";

interface PbBalanceResponse {
  success?: boolean;
  betCredit?: number;
  currency?: string;
  error?: string;
}

export const pbProvider: PlatformProvider = {
  async getBalance(account) {
    if (!account.gateway || !account.token) {
      throw new Error("token error");
    }
    const headers = buildPbAuthHeaders(account);
    if (!headers) throw new Error("token error");

    const path = `/member-service/v2/account-balance?locale=zh_CN&_=${Date.now()}&withCredentials=true`;
    const data = await accountPostText<PbBalanceResponse>(account, path, "", headers);
    if (data.error) {
      throw new Error(data.error === "MULTIPLE_LOGIN" ? "token error" : String(data.error));
    }
    if (!data.success) {
      throw new Error("token error");
    }
    const multiply = Math.max(1, account.multiply ?? 1);
    return {
      balance: Number(data.betCredit) * multiply || 0,
      currency: data.currency || "CNY",
    };
  },

  async checkBet(_account, option) {
    option.checkError = "PB 下注请使用 A8 插件控制台";
    return option;
  },

  async betting(account, option) {
    return new BetResult(account.provider, false, "PB 下注请使用 A8 插件控制台", option.data);
  },
};
