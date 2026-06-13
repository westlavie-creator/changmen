<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { startCollectors, stopCollectors } from "@/runtime/collectors";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import ExtensionsBadge from "@/components/layout/ExtensionsBadge.vue";
import MatchCard from "@/components/match/MatchCard.vue";
import LoginPanel from "@/components/auth/LoginPanel.vue";
import PluginIntroShell from "@/components/layout/PluginIntroShell.vue";
import { useExtensionGate } from "@/composables/useExtensionGate";
import { useUserStore } from "@/stores/userStore";
import { useMatchStore } from "@/stores/matchStore";
import { useCollectStore } from "@/stores/collectStore";
import { useConfigStore } from "@/stores/configStore";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useBettingStore } from "@/stores/bettingStore";
import { useMessageStore } from "@/stores/messageStore";
import { startHgFollowLoop, stopHgFollowLoop } from "@platform/hg";
import { primeStakeTabId } from "@platform/stake";

const router = useRouter();
const user = useUserStore();
const matchStore = useMatchStore();
const collectStore = useCollectStore();
const configStore = useConfigStore();
const accountStore = useAccountStore();
const loseOrderStore = useLoseOrderStore();
const bettingStore = useBettingStore();
const messageStore = useMessageStore();
const { matchs } = storeToRefs(matchStore);
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);
const { ready: userReady } = storeToRefs(user);

const searchQuery = ref("");
const { extensionReady, extensionVersion } = useExtensionGate();
const isLoggedIn = computed(() => userReady.value);

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

let homeStarted = false;

function stopHome() {
  stopHgFollowLoop();
  messageStore.stop();
  bettingStore.stop();
  accountStore.stopBalanceRefreshLoop();
  matchStore.stopPolling();
  stopCollectors();
  homeStarted = false;
}

async function startHome() {
  if (homeStarted || !extensionReady.value || !isLoggedIn.value) return;
  homeStarted = true;
  await user.fetchUserInfo();
  loseOrderStore.init();
  await Promise.all([collectStore.init(), configStore.load(), accountStore.loadAccounts(true)]);
  await matchStore.initBetTarget();
  void matchStore.startPolling();
  await startCollectors();
  primeStakeTabId();
  bettingStore.start();
  messageStore.start();
  startHgFollowLoop();
}

onMounted(() => {
  void startHome();
});

watch([extensionReady, isLoggedIn], () => {
  void startHome();
});

onUnmounted(() => {
  stopHome();
});

async function logout() {
  stopHome();
  await user.logout();
}

async function onLoginSuccess() {
  await startHome();
  const redirect = sessionStorage.getItem("gamebet:postLoginRedirect");
  sessionStorage.removeItem("gamebet:postLoginRedirect");
  if (redirect && redirect !== "/" && redirect.startsWith("/")) {
    await router.replace(redirect);
  }
}
</script>

<template>
  <PluginIntroShell v-if="!extensionReady" :show-login="false" />
  <PluginIntroShell v-else-if="!isLoggedIn" :show-login="true">
    <LoginPanel :extension-version="extensionVersion" @success="onLoginSuccess" />
  </PluginIntroShell>
  <template v-else>
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
</template>
