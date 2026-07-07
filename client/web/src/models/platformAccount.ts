export {
  normalizeAccountRateConfig,
  resolveAccountPauseReason,
  type AccountRateRow,
  PlatformAccount as PlatformAccountCore,
} from "@changmen/client-core/models/platformAccount";

import { PlatformAccount as CorePlatformAccount } from "@changmen/client-core/models/platformAccount";

/** web 扩展：余额/订单刷新走 Pinia account store */
export class PlatformAccount extends CorePlatformAccount {
  async updateBalance(): Promise<void> {
    const { useAccountStore } = await import("@/stores/accountStore");
    const { refreshAccountBalance } = await import("@/stores/account/balanceRefresh");
    return refreshAccountBalance(useAccountStore(), this);
  }

  async updateOrders() {
    const { updateVenueOrders } = await import("@/stores/account/venueOrders");
    return updateVenueOrders(this);
  }
}
