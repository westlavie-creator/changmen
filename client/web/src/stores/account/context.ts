import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId, TagPlatformRow } from "@/types/esport";

/** Pinia account store 切片：模块函数通过此类型访问状态与编排方法 */
export interface AccountStoreContext {
  accounts: PlatformAccount[];
  tagPlatforms: TagPlatformRow[];
  providerPickIndex: Map<PlatformId, number>;
  balanceRefreshRunning: boolean;
  loading: boolean;
  loaded: boolean;
  editDialogOpen: boolean;
  editDialogAccount: PlatformAccount | undefined;
  findAccount(accountId?: number): PlatformAccount | undefined;
  getPlatformName(platformId?: number, fallback?: string): string;
  saveAccounts(): Promise<boolean>;
  loadTagPlatforms(): Promise<void>;
  refreshAllFromVenues(): Promise<void>;
}
