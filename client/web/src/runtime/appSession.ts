import {
  installArbRuntimeSync,
  syncArbRuntime,
  teardownArbRuntimeSync,
} from "@/extensions/arbOpportunity";
import { bootSessionRuntime, stopSessionRuntime } from "@/runtime/sessionBoot";
import { useAccountStore } from "@/stores/accountStore";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";
import { useOddsStore } from "@/stores/oddsStore";
import { useOrderStore } from "@/stores/orderStore";
import { useUserStore } from "@/stores/userStore";

async function applyPmTransportRoutingOnLogin(): Promise<void> {
  try {
    const { applyPmAutoTransportOnLogin } = await import("@changmen/venue-adapter/polymarket");
    await applyPmAutoTransportOnLogin();
  }
  catch (err) {
    if (import.meta.env?.DEV)
      console.warn("[PM transport] auto route skipped", err);
  }
}

async function resetPmTransportRoutingOnLogout(): Promise<void> {
  try {
    const { resetPmTransportRoutingOnLogout } = await import("@changmen/venue-adapter/polymarket");
    resetPmTransportRoutingOnLogout();
  }
  catch {
    /* ignore */
  }
}

/** HomeView 挂载时：主循环、消息队列、扩展旁路 sync（调用顺序与原先 HomeView 一致） */
export function startAppSession(): void {
  useMatchStore().startMainLoop();
  useMessageStore().start();
  installArbRuntimeSync();
  syncArbRuntime();
}

/** HomeView onMounted：用户信息、账号列表、采集/HG 运行时 */
export async function mountAppSession(): Promise<void> {
  const user = useUserStore();
  if (!user.userId) {
    await user.fetchUserInfo();
  }
  await applyPmTransportRoutingOnLogin();
  useAccountStore().loadAccounts(true);
  await bootSessionRuntime();
}

/** HomeView 卸载 / logout：对称 teardown（不含 user.logout） */
export function stopAppSession(): void {
  void resetPmTransportRoutingOnLogout();
  stopSessionRuntime();
  teardownArbRuntimeSync();
  useMessageStore().stop();
  useMatchStore().stopMainLoop();
  useAccountStore().stopBalanceRefreshLoop();
  clearSessionCaches();
}

/** 清除运行时缓存，避免 SPA 切换用户后残留上一 session 的数据 */
function clearSessionCaches(): void {
  const matchStore = useMatchStore();
  matchStore.matchs = [];
  matchStore.defaultOdds.clear();
  matchStore.defaultOddsFetchedAt = 0;
  matchStore.lastFetchAt = 0;
  matchStore.lastLoseOrderPruneAt = Date.now();

  useOddsStore().$reset();
  useOrderStore().$reset();
  useAccountStore().resetSession();
}
