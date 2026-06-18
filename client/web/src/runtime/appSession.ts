import {
  installArbRuntimeSync,
  syncArbRuntime,
  teardownArbRuntimeSync,
} from "@/extensions/arbOpportunity";
import { bootSessionRuntime, stopSessionRuntime } from "@/runtime/sessionBoot";
import { useAccountStore } from "@/stores/accountStore";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

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
  useAccountStore().loadAccounts(true);
  await bootSessionRuntime();
}

/** HomeView 卸载 / logout：对称 teardown（不含 user.logout） */
export function stopAppSession(): void {
  stopSessionRuntime();
  teardownArbRuntimeSync();
  useMessageStore().stop();
  useMatchStore().stopMainLoop();
  useAccountStore().stopBalanceRefreshLoop();
}
