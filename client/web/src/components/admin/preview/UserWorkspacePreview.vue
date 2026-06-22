<script setup lang="ts">
import type { AdminUserRow } from "@/types/admin";
import { storeToRefs } from "pinia";
import { reactive, watch } from "vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import UserConfigPanel from "@/components/user/UserConfigPanel.vue";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useUserStore } from "@/stores/userStore";
import { createUserConfigFormState } from "@/components/user/userConfigFormState";

defineProps<{
  user: AdminUserRow;
}>();

defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);
const configStore = useConfigStore();
const userStore = useUserStore();
let configForm = reactive(createUserConfigFormState(configStore.config));
watch(() => configStore.config, (c) => { Object.assign(configForm, createUserConfigFormState(c)); });
</script>

<template>
  <div class="user-workspace-preview">
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      readonly
      @close="accountStore.closeAccountDialog()"
    />

    <section class="user-workspace-preview__section">
      <h3 class="user-workspace-preview__heading">Telegram</h3>
      <div class="user-workspace-preview__info-row">
        <span class="user-workspace-preview__label">Chat ID</span>
        <span class="user-workspace-preview__value">{{ userStore.message?.telegramId || '未配置' }}</span>
      </div>
    </section>

    <section class="user-workspace-preview__section">
      <h3 class="user-workspace-preview__heading">投注账号</h3>
      <AccountBar embedded />
    </section>

    <section class="user-workspace-preview__section">
      <h3 class="user-workspace-preview__heading">用户配置</h3>
      <UserConfigPanel v-model:form="configForm" readonly />
    </section>
  </div>
</template>

<style scoped>
.user-workspace-preview {
  min-height: 400px;
  padding: 8px 0;
}
.user-workspace-preview__section {
  margin-bottom: 20px;
}
.user-workspace-preview__heading {
  margin: 0 0 8px 4px;
  font-size: 14px;
  font-weight: 600;
  color: var(--adm-text, #e2e8f0);
}
.user-workspace-preview__info-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px;
  font-size: 13px;
}
.user-workspace-preview__label {
  color: var(--adm-text-muted, #94a3b8);
  min-width: 60px;
}
.user-workspace-preview__value {
  color: var(--adm-text, #e2e8f0);
  font-family: monospace;
}
/* 去掉 UserConfigPanel 内部的白色背景 */
.user-workspace-preview :deep(.el-form-item),
.user-workspace-preview :deep(.el-input__wrapper),
.user-workspace-preview :deep(.el-select .el-input__wrapper),
.user-workspace-preview :deep(.el-textarea__inner),
.user-workspace-preview :deep(.el-switch),
.user-workspace-preview :deep(.el-radio-group),
.user-workspace-preview :deep(.el-checkbox-group) {
  background: transparent !important;
}
.user-workspace-preview :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background: rgba(255, 255, 255, 0.04) !important;
}
.user-workspace-preview :deep(.el-textarea__inner) {
  box-shadow: none !important;
  background: rgba(255, 255, 255, 0.04) !important;
}
</style>
