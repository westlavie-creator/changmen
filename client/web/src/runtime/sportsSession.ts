/**
 * 体育页 `/sports` 专用会话：账号/订单壳 + 余额刷新。
 * 禁止启动电竞 mainBetLoop / 采集 / fo（双标签时由 `/` 页负责电竞 runtime）。
 */
import { useAccountStore } from "@/stores/accountStore";
import { useUserStore } from "@/stores/userStore";

async function applyPmTransportRoutingOnLogin(): Promise<void> {
  try {
    const { applyPmAutoTransportOnLogin } = await import("@changmen/venue-adapter/polymarket");
    await applyPmAutoTransportOnLogin();
  }
  catch (err) {
    if (import.meta.env?.DEV)
      console.warn("[sportsSession] PM transport skipped", err);
  }
}

async function applyPfTransportRoutingOnLogin(): Promise<void> {
  try {
    const { applyPfAutoTransportOnLogin } = await import("@changmen/venue-adapter/predictfun");
    await applyPfAutoTransportOnLogin();
  }
  catch (err) {
    if (import.meta.env?.DEV)
      console.warn("[sportsSession] PF transport skipped", err);
  }
}

/** SportsWorkspace onMounted：共享壳，不启电竞环 */
export async function mountSportsSession(): Promise<void> {
  const user = useUserStore();
  if (!user.userId)
    await user.fetchUserInfo();
  await applyPmTransportRoutingOnLogin();
  await applyPfTransportRoutingOnLogin();
  const accountStore = useAccountStore();
  await accountStore.loadAccounts(false);
  try {
    const {
      ensurePmVaultUnlocked,
      hasVault,
      mergeVaultKeysIntoAccounts,
      migrateTokenPrivateKeysToVault,
      normalizePmVaultUserId,
    } = await import("@/security/pmVault");
    const uid = normalizePmVaultUserId(user.userId);
    if (uid && await hasVault(uid)) {
      const unlocked = await ensurePmVaultUnlocked(uid);
      if (unlocked) {
        mergeVaultKeysIntoAccounts(accountStore.accounts, uid);
        const migrated = await migrateTokenPrivateKeysToVault(accountStore.accounts, uid);
        if (migrated > 0)
          void accountStore.saveAccounts();
      }
    }
  }
  catch (err) {
    if (import.meta.env?.DEV)
      console.warn("[sportsSession] pmVault unlock skipped", err);
  }
  // 不调用 bootSessionRuntime / startAppSession（无采集、无 mainBetLoop）
  void (async () => {
    try {
      await accountStore.loadTagPlatforms();
      accountStore.startBalanceRefreshLoop();
      const balanceRefresh = await import("@/stores/account/balanceRefresh");
      await balanceRefresh.refreshAllFromVenues(accountStore, true);
      const { useOrderStore } = await import("@/stores/orderStore");
      await useOrderStore().fetchOrders();
    }
    catch (err) {
      if (import.meta.env?.DEV)
        console.warn("[sportsSession] post-unlock refresh", err);
    }
  })();
}

/**
 * SportsWorkspace 卸载：只停本页余额环。
 * 不 lock vault / 不 reset 传输 / 不清账号——避免双标签时误伤电竞页共享存储。
 */
export function stopSportsSession(): void {
  useAccountStore().stopBalanceRefreshLoop();
}
