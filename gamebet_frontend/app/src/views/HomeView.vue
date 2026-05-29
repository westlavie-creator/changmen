<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { startCollectors, stopCollectors } from "@/collectors";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import ExtensionsBadge from "@/components/layout/ExtensionsBadge.vue";
import MatchCard from "@/components/match/MatchCard.vue";
import { useUserStore } from "@/stores/userStore";
import { useMatchStore } from "@/stores/matchStore";
import { useCollectStore } from "@/stores/collectStore";
import { useConfigStore } from "@/stores/configStore";
import { useAccountStore } from "@/stores/accountStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useBettingStore } from "@/stores/bettingStore";
import { useMessageStore } from "@/stores/messageStore";
import { startHgFollowLoop, stopHgFollowLoop } from "@/collectors/hg/followLoop";

const router = useRouter();
const user = useUserStore();
const matchStore = useMatchStore();
const collectStore = useCollectStore();
const configStore = useConfigStore();
const accountStore = useAccountStore();
const loseOrderStore = useLoseOrderStore();
const bettingStore = useBettingStore();
const messageStore = useMessageStore();
const { matchs, error } = storeToRefs(matchStore);
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

onMounted(async () => {
  await user.fetchUserInfo();
  loseOrderStore.init();
  await Promise.all([collectStore.init(), configStore.load(), accountStore.loadAccounts(true)]);
  await matchStore.initBetTarget();
  matchStore.startPolling();
  await startCollectors();
  bettingStore.start();
  messageStore.start();
  startHgFollowLoop();
});

onUnmounted(() => {
  stopHgFollowLoop();
  messageStore.stop();
  bettingStore.stop();
  accountStore.stopBalanceRefreshLoop();
  matchStore.stopPolling();
  stopCollectors();
});

async function logout() {
  stopHgFollowLoop();
  messageStore.stop();
  bettingStore.stop();
  accountStore.stopBalanceRefreshLoop();
  stopCollectors();
  matchStore.stopPolling();
  await user.logout();
  await router.push({ name: "login" });
}
</script>

<template>
  <!-- 对齐 bundle HomeView：el-aside(260) + el-header(AccountView + ExtensionsView) + el-main -->
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
        <p v-if="error" class="app-hint app-hint--err">{{ error }}</p>
        <div v-if="matchs.length" class="matchs">
          <MatchCard v-for="m in matchs" :key="m.id" :match="m" />
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.home-view {
  height: 100%;
}
.app-hint {
  padding: 24px;
  text-align: center;
  color: #94a3b8;
  font-size: 14px;
}
.app-hint--err {
  color: #f87171;
}
</style>
