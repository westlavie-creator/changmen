<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onActivated, onMounted, onUnmounted, ref, watch } from "vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import DirectRealtimeBadge from "@/components/layout/DirectRealtimeBadge.vue";
import ExtensionsBadge from "@/components/layout/ExtensionsBadge.vue";
import CreateLoseDialog from "@/components/match/CreateLoseDialog.vue";
import MatchCard from "@/components/match/MatchCard.vue";
import ActiveBetRunView from "@/components/order/ActiveBetRunView.vue";
import { useExtensionGate } from "@/composables/useExtensionGate";
import {
  mountAppSession,
  startAppSession,
  stopAppSession,
} from "@/runtime/appSession";
import { useAccountStore } from "@/stores/accountStore";
import { useCreateLoseDialogStore } from "@/stores/createLoseDialogStore";
import { useMatchStore } from "@/stores/matchStore";
import { useUserStore } from "@/stores/userStore";

const user = useUserStore();
const matchStore = useMatchStore();
const accountStore = useAccountStore();
const createLoseDialog = useCreateLoseDialogStore();
const { matchs } = storeToRefs(matchStore);
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);
const {
  open: createLoseOpen,
  match: createLoseMatch,
  bet: createLoseBet,
} = storeToRefs(createLoseDialog);

startAppSession();

const searchQuery = ref("");
const { extensionReady, refreshExtension } = useExtensionGate();

const filteredMatchs = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q)
    return matchs.value;
  return matchs.value.filter((m) => {
    if (String(m.id).includes(q))
      return true;
    if (m.title.toLowerCase().includes(q))
      return true;
    if (m.game.toLowerCase().includes(q))
      return true;
    return m.bets.some(
      b => b.homeName.toLowerCase().includes(q) || b.awayName.toLowerCase().includes(q),
    );
  });
});

/** [A8 可证实] xo：await getUserInfo(), loadAccounts(!0) — comma 不 await loadAccounts */
onMounted(() => {
  void mountAppSession();
});

/** [A8 可证实] zt：await initBetTarget() */
onActivated(async () => {
  await matchStore.initBetTarget();
});

watch(extensionReady, (ext) => {
  if (!ext)
    return;
  void import("@venue/stake").then(({ primeStakeTabId }) => primeStakeTabId());
});

onUnmounted(() => {
  stopAppSession();
});

async function logout() {
  stopAppSession();
  await user.logout();
}
</script>

<template>
  <AccountEditDialog
    :open="editDialogOpen"
    :account="editDialogAccount"
    @close="accountStore.closeAccountDialog()"
  />
  <!-- [A8 可证实] HomeView 单例 CreateLoseView：v-if + match/bet/close -->
  <CreateLoseDialog
    v-if="createLoseOpen && createLoseMatch && createLoseBet"
    :match="createLoseMatch"
    :bet="createLoseBet"
    @close="createLoseDialog.close()"
  />
  <el-container class="common-layout home-view">
    <el-aside width="260px">
      <AppSidebar @logout="logout" />
    </el-aside>
    <el-container>
      <el-header>
        <AccountBar />
        <div class="home-header-trailing">
          <DirectRealtimeBadge />
          <ExtensionsBadge />
        </div>
        <p v-if="!extensionReady" class="extension-banner">
          扩展未连通，采集/下注不可用。
          <el-button link type="primary" @click="refreshExtension">
            重新检测
          </el-button>
        </p>
      </el-header>
      <el-main class="home-main">
        <ActiveBetRunView />
        <el-input
          v-model="searchQuery"
          placeholder="搜索队名 / 比赛ID / 游戏..."
          clearable
          class="match-search"
        />
        <div v-if="filteredMatchs.length" class="matchs">
          <MatchCard v-for="m in filteredMatchs" :key="m.id" :match="m" />
        </div>
        <div v-else-if="searchQuery" class="match-empty">
          无匹配比赛
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>
