import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult } from "@/models/betResult";
import { isVenueReject } from "@/domain/betting";
import type { VenueOrder } from "@platform/contract";
import { useAccountStore } from "@/stores/accountStore";
import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";

export interface VenueRejectFlags {
  ordersA: VenueOrder[];
  ordersB: VenueOrder[];
  rejectA: boolean;
  rejectB: boolean;
}

/** 拉场馆订单并判定首条是否拒单（对齐 A8 `isVenueReject`） */
export async function fetchVenueOrdersWithReject(
  account: PlatformAccount,
): Promise<{ orders: VenueOrder[]; rejected: boolean }> {
  const orders = (await useAccountStore().updateVenueOrders(account)) ?? [];
  return { orders, rejected: isVenueReject(orders) };
}

/** 自动套利双腿：分别 sync 场馆订单与拒单标记 */
export async function syncVenueRejectFlags(
  resultA: BetResult | undefined,
  accountA: PlatformAccount | undefined,
  resultB: BetResult | undefined,
  accountB: PlatformAccount | undefined,
): Promise<VenueRejectFlags> {
  let ordersA: VenueOrder[] = [];
  let ordersB: VenueOrder[] = [];
  let rejectA = false;
  let rejectB = false;
  if (resultA?.success && accountA) {
    const synced = await fetchVenueOrdersWithReject(accountA);
    ordersA = synced.orders;
    rejectA = synced.rejected;
  }
  if (resultB?.success && accountB) {
    const synced = await fetchVenueOrdersWithReject(accountB);
    ordersB = synced.orders;
    rejectB = synced.rejected;
  }
  return { ordersA, ordersB, rejectA, rejectB };
}

/**
 * 拒单等待：显示 Oe 倒计时，每秒 wait 后拉单；任一侧拒单则提前结束。
 * q<=0 时与 A8 相同：不 wait，仅拉单一次。
 */
export async function pollVenueRejectFlags(
  resultA: BetResult | undefined,
  accountA: PlatformAccount | undefined,
  resultB: BetResult | undefined,
  accountB: PlatformAccount | undefined,
  countdownSec: number,
  pollSec: number,
): Promise<VenueRejectFlags> {
  if (countdownSec > 0) {
    a8Tip("拒单检测", `等待<countdown>${countdownSec}</countdown>秒`, countdownSec * 1000);
  }
  if (pollSec <= 0) {
    return syncVenueRejectFlags(resultA, accountA, resultB, accountB);
  }

  let flags: VenueRejectFlags = {
    ordersA: [],
    ordersB: [],
    rejectA: false,
    rejectB: false,
  };
  for (let i = 0; i < pollSec; i++) {
    await wait(1000);
    flags = await syncVenueRejectFlags(resultA, accountA, resultB, accountB);
    if (flags.rejectA || flags.rejectB) break;
  }
  return flags;
}
