<script setup lang="ts">
import { ref, computed, onMounted, onActivated, onUnmounted, watch } from "vue";
import { storeToRefs } from "pinia";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import ExtensionsBadge from "@/components/layout/ExtensionsBadge.vue";
import MatchCard from "@/components/match/MatchCard.vue";
import { useExtensionGate } from "@/composables/useExtensionGate";
import { useUserStore } from "@/stores/userStore";
import { useMatchStore } from "@/stores/matchStore";
import { useAccountStore } from "@/stores/accountStore";
import { useMessageStore } from "@/stores/messageStore";
import {
  installArbRuntimeSync,
  syncArbRuntime,
  teardownArbRuntimeSync,
} from "@/extensions/arbOpportunity";
import { bootSessionRuntime, stopSessionRuntime } from "@/runtime/sessionBoot";

const user = useUserStore();
const matchStore = useMatchStore();
const accountStore = useAccountStore();
const messageStore = useMessageStore();
const { matchs } = storeToRefs(matchStore);
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

// [A8 可证实] zg：return P(),{matchs…} — store 创建时启动主循环
void matchStore.startMainLoop();
// [A8 可证实] Ki：a() — store 创建时启动 Telegram 队列
messageStore.start();
// [changmen 扩展] 按配置启停：arbMarketWatch / kakaxi 检测旁路（A8 主循环不变）
installArbRuntimeSync();
syncArbRuntime();

const searchQuery = ref("");
const { extensionReady, refreshExtension } = useExtensionGate();

const filteredMatchs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return matchs.value;
  return matchs.value.filter((m) => {
    if (String(m.id).includes(q)) return true;
    if (m.title.toLowerCase().includes(q)) return true;
    if (m.game.toLowerCase().includes(q)) return true;
    return m.bets.some(
      (b) => b.homeName.toLowerCase().includes(q) || b.awayName.toLowerCase().includes(q),
    );
  });
});

function stopHome() {
  stopSessionRuntime();
  teardownArbRuntimeSync();
  messageStore.stop();
  matchStore.stopMainLoop();
  accountStore.stopBalanceRefreshLoop();
}

/** [A8 可证实] xo：await getUserInfo(), loadAccounts(!0) — comma 不 await loadAccounts */
onMounted(async () => {
  if (!user.userId) {
    await user.fetchUserInfo();
  }
  accountStore.loadAccounts(true);
  void bootSessionRuntime();
});

/** [A8 可证实] zt：await initBetTarget() */
onActivated(async () => {
  await matchStore.initBetTarget();
});

watch(extensionReady, (ext) => {
  if (!ext) return;
  void import("@platform/stake").then(({ primeStakeTabId }) => primeStakeTabId());
});

onUnmounted(() => {
  stopHome();
});

async function logout() {
  stopHome();
  await user.logout();
}
</script>

<template>
  <AccountEditDialog
    :open="editDialogOpen"
    :account="editDialogAccount"
    @close="accountStore.closeAccountDialog()"
  />
  <el-container class="common-layout home-view">
    <el-aside width="260px">
      <AppSidebar @logout="logout" />
    </el-aside>
    <el-container>
      <el-header>
        <AccountBar />
        <ExtensionsBadge />
        <p v-if="!extensionReady" class="extension-banner">
          扩展未连通，采集/下注不可用。
          <el-button link type="primary" @click="refreshExtension">重新检测</el-button>
        </p>
      </el-header>
      <el-main>
        <el-input
          v-model="searchQuery"
          placeholder="搜索队名 / 比赛ID / 游戏..."
          clearable
          class="match-search"
        />
        <div v-if="filteredMatchs.length" class="matchs">
          <MatchCard v-for="m in filteredMatchs" :key="m.id" :match="m" />
        </div>
        <div v-else-if="searchQuery" class="match-empty">无匹配比赛</div>
      </el-main>
    </el-container>
  </el-container>
</template>
