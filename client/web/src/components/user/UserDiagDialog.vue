<script setup lang="ts">
/**
 * 对齐 console bundle `UserDiagView`（dHe）：`el-dialog` width 880 + `border-card` tabs。
 */
import { computed, onMounted, ref, watch, type Component } from "vue";
import { storeToRefs } from "pinia";
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
import UserDiagExtensionTab from "@/components/user/tabs/UserDiagExtensionTab.vue";
import { useUserStore } from "@/stores/userStore";

const props = defineProps<{ open: boolean }>();
const user = useUserStore();
const emit = defineEmits<{ close: [] }>();

const { setting } = storeToRefs(user);
const active = ref("rank");

const visible = computed({
  get: () => props.open,
  set: (v: boolean) => {
    if (!v) emit("close");
  },
});

type TabDef = {
  name: string;
  label: string;
  component: Component;
  show?: () => boolean;
};

const tabDefs: TabDef[] = [
  { name: "rank", label: "排行榜", component: UserDiagRankTab },
  { name: "pass", label: "修改密码", component: UserDiagPasswordTab },
  { name: "message", label: "消息通知", component: UserDiagMessageTab },
  { name: "extension", label: "9999单边", component: UserDiagExtensionTab },
  { name: "proxy", label: "代理配置", component: UserDiagProxyTab },
  { name: "report", label: "报表查询", component: UserDiagReportTab },
  { name: "collect", label: "赛事采集", component: UserDiagCollectTab },
  {
    name: "trade",
    label: "操盘",
    component: UserDiagTradeTab,
    show: () => Boolean(setting.value?.BetTarget) || user.betTargetEnabled(),
  },
  {
    name: "follow",
    label: "跟单",
    component: UserDiagFollowTab,
    show: () => user.followEnabled,
  },
  { name: "chat", label: "聊天室", component: UserDiagChatTab },
  { name: "wallet", label: "钱包", component: UserDiagWalletTab },
];

const visibleTabs = computed(() => tabDefs.filter((t) => !t.show || t.show()));

watch(
  () => props.open,
  () => {
    if (!visibleTabs.value.some((t) => t.name === active.value)) {
      active.value = "rank";
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (!visibleTabs.value.some((t) => t.name === active.value)) {
    active.value = "rank";
  }
});

async function onDialogOpen() {
  await user.loadExtras(true);
}

function onDialogClosed() {
  emit("close");
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="user-diag-dialog"
    width="880"
    :show-close="false"
    append-to-body
    destroy-on-close
    @open="onDialogOpen"
    @closed="onDialogClosed"
  >
    <el-tabs v-model="active" type="border-card">
      <el-tab-pane v-for="tab in visibleTabs" :key="tab.name" :label="tab.label" :name="tab.name">
        <component :is="tab.component" v-if="active === tab.name" />
      </el-tab-pane>
    </el-tabs>
  </el-dialog>
</template>
