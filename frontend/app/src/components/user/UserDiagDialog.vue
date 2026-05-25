<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import AppDialog from "@/components/ui/AppDialog.vue";
import UserDiagRankTab from "@/components/user/tabs/UserDiagRankTab.vue";
import UserDiagPasswordTab from "@/components/user/tabs/UserDiagPasswordTab.vue";
import UserDiagMessageTab from "@/components/user/tabs/UserDiagMessageTab.vue";
import UserDiagProxyTab from "@/components/user/tabs/UserDiagProxyTab.vue";
import UserDiagReportTab from "@/components/user/tabs/UserDiagReportTab.vue";
import UserDiagCollectTab from "@/components/user/tabs/UserDiagCollectTab.vue";
import UserDiagTradeTab from "@/components/user/tabs/UserDiagTradeTab.vue";
import UserDiagFollowTab from "@/components/user/tabs/UserDiagFollowTab.vue";
import UserDiagChatTab from "@/components/user/tabs/UserDiagChatTab.vue";
import UserDiagWalletTab from "@/components/user/tabs/UserDiagWalletTab.vue";
import { useUserStore } from "@/stores/userStore";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();

const user = useUserStore();
const { setting } = storeToRefs(user);
const active = ref("rank");

const showBetTargetTabs = computed(
  () => Boolean(setting.value?.BetTarget) || user.betTargetEnabled(),
);

const tabDefs = computed(() => {
  const list: { id: string; label: string; component: object }[] = [
    { id: "rank", label: "排行榜", component: UserDiagRankTab },
    { id: "pass", label: "修改密码", component: UserDiagPasswordTab },
    { id: "message", label: "消息通知", component: UserDiagMessageTab },
    { id: "proxy", label: "代理配置", component: UserDiagProxyTab },
    { id: "report", label: "报表查询", component: UserDiagReportTab },
    { id: "collect", label: "赛事采集", component: UserDiagCollectTab },
    { id: "chat", label: "聊天室", component: UserDiagChatTab },
    { id: "wallet", label: "钱包", component: UserDiagWalletTab },
  ];
  if (showBetTargetTabs.value) {
    list.splice(6, 0, { id: "trade", label: "操盘", component: UserDiagTradeTab });
  }
  if (user.followEnabled) {
    const insertAt = list.findIndex((t) => t.id === "chat");
    list.splice(insertAt >= 0 ? insertAt : list.length, 0, {
      id: "follow",
      label: "跟单",
      component: UserDiagFollowTab,
    });
  }
  return list;
});

const activeComponent = computed(
  () => tabDefs.value.find((t) => t.id === active.value)?.component ?? UserDiagRankTab,
);

onMounted(() => {
  if (!tabDefs.value.some((t) => t.id === active.value)) {
    active.value = "rank";
  }
});
</script>

<template>
  <AppDialog :open="open" title="用户中心" width="880px" @close="emit('close')">
    <div class="user-diag">
      <nav class="user-diag__tabs">
        <button
          v-for="tab in tabDefs"
          :key="tab.id"
          type="button"
          class="user-diag__tab"
          :class="{ 'user-diag__tab--active': active === tab.id }"
          @click="active = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>
      <div class="user-diag__body">
        <component :is="activeComponent" />
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.user-diag__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 0;
  border: 1px solid #334155;
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  overflow: hidden;
}
.user-diag__tab {
  border: none;
  border-right: 1px solid #334155;
  background: #0f172a;
  color: #94a3b8;
  padding: 8px 14px;
  font-size: 12px;
  cursor: pointer;
}
.user-diag__tab:last-child {
  border-right: none;
}
.user-diag__tab--active {
  background: #1e293b;
  color: #e2e8f0;
  font-weight: 600;
}
.user-diag__body {
  max-height: 60vh;
  overflow: auto;
  border: 1px solid #334155;
  border-radius: 0 0 4px 4px;
  padding: 12px;
  background: #0f172a40;
}
</style>
