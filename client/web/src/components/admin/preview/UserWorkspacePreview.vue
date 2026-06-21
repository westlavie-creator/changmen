<script setup lang="ts">
import type { AdminUserRow } from "@/types/admin";
import { storeToRefs } from "pinia";
import { onMounted, ref, watch } from "vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import AppSidebar from "@/components/layout/AppSidebar.vue";
import { loadEmbeddedUserOrders } from "@/composables/adminUserWorkspaceMount";
import { todayKey } from "@/shared/dateKey";
import { useAccountStore } from "@/stores/accountStore";

const props = defineProps<{
  user: AdminUserRow;
}>();

const emit = defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

const ordersError = ref("");

async function refreshOrders(date = todayKey()) {
  ordersError.value = "";
  try {
    await loadEmbeddedUserOrders(props.user.id, date);
  }
  catch (err) {
    ordersError.value = err instanceof Error ? err.message : "订单加载失败";
    console.warn("[adminUserWorkspace] load orders:", err);
  }
}

onMounted(() => {
  void refreshOrders();
});

watch(
  () => props.user.id,
  () => {
    void refreshOrders();
  },
);
</script>

<template>
  <div class="user-workspace-preview">
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      readonly
      @close="accountStore.closeAccountDialog()"
    />
    <p v-if="ordersError" class="user-workspace-preview__err">
      {{ ordersError }}
    </p>
    <el-container class="common-layout home-view user-workspace-preview__layout">
      <el-aside width="260px">
        <AppSidebar
          embedded
          :embedded-user-id="user.id"
          :embedded-user-name="user.userName"
          @view-orders="emit('viewOrders')"
        />
      </el-aside>
      <el-container>
        <el-header>
          <AccountBar embedded />
        </el-header>
        <el-main class="user-workspace-preview__main">
          <p class="user-workspace-preview__hint">
            与前台布局一致：侧栏为当日订单（只读），顶栏为账号卡；点齿轮 / 编辑可查看配置（不可保存）。
          </p>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<style scoped>
.user-workspace-preview {
  min-height: 560px;
}
.user-workspace-preview__layout {
  min-height: 560px;
}
.user-workspace-preview__main {
  padding: 12px 16px 20px;
  overflow: auto;
}
.user-workspace-preview__hint {
  margin: 24px 0 0;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
}
.user-workspace-preview__err {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  color: #f87171;
  background: rgba(248, 113, 113, 0.08);
  border-bottom: 1px solid rgba(248, 113, 113, 0.2);
}
</style>
