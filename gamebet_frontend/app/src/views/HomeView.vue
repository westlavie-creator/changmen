<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { startCollectors, stopCollectors } from "@/collectors";
import AppHeader from "@/components/layout/AppHeader.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import AccountBar from "@/components/account/AccountBar.vue";
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
const { matchs, loading, error } = storeToRefs(matchStore);

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
  <div class="common-layout app-shell">
    <div class="app-shell__row flex">
      <AppSidebar @logout="logout" />
      <div class="app-shell__main flex flex-column">
        <AppHeader />
        <AccountBar />
        <main class="app-main">
          <p v-if="loading && !matchs.length" class="app-hint">加载比赛列表…</p>
          <p v-else-if="error" class="app-hint app-hint--err">{{ error }}</p>
          <p v-else-if="!matchs.length" class="app-hint">
            暂无比赛。请确认 gamebet_backend 已启动，且 OB/RAY 采集已开启。
          </p>
          <div v-else class="matchs">
            <MatchCard v-for="m in matchs" :key="m.id" :match="m" />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
}
.app-shell__row {
  height: 100%;
}
.app-shell__main {
  flex: 1;
  min-width: 0;
  height: 100%;
}
.app-main {
  flex: 1;
  overflow: auto;
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
