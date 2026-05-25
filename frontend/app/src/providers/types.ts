import type { BetOption } from "@/models/betOption";
import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";

export interface AccountBalanceResult {
  balance: number;
  currency?: string;
}

export interface PlatformProvider {
  getBalance?(account: PlatformAccount): Promise<AccountBalanceResult>;
  checkBet(account: PlatformAccount, option: BetOption): Promise<BetOption>;
  betting(account: PlatformAccount, option: BetOption): Promise<BetResult>;
}
