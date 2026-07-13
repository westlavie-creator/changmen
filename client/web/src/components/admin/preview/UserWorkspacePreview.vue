<script setup lang="ts">
import type { AdminUserRow } from "@/types/admin";
import { storeToRefs } from "pinia";
import { reactive, watch } from "vue";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import { createUserConfigFormState } from "@/components/user/userConfigFormState";
import UserConfigPanel from "@/components/user/UserConfigPanel.vue";
import { useAccountStore } from "@/stores/accountStore";
import { useUserStore } from "@/stores/userStore";

const props = defineProps<{ user: AdminUserRow }>();
defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);
const userStore = useUserStore();

let form = reactive(createUserConfigFormState(userStore.config));
watch(() => userStore.config, c => Object.assign(form, createUserConfigFormState(c)));

function onAdminMultiplySaved(multiply: number) {
  const acc = editDialogAccount.value;
  if (!acc)
    return;
  const row = props.user.accounts?.find(a => a.accountId === acc.accountId);
  if (row)
    row.multiply = multiply;
}

function onAdminPauseSaved(accountId: number, pause: boolean) {
  const row = props.user.accounts?.find(a => a.accountId === accountId);
  if (row)
    row.pause = pause;
}
</script>

<template>
  <div class="wp">
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      :admin-target-user-id="user.id"
      allow-multiply-edit
      allow-pause-edit
      readonly
      @close="accountStore.closeAccountDialog()"
      @multiply-saved="onAdminMultiplySaved"
      @pause-saved="(pause) => editDialogAccount && onAdminPauseSaved(editDialogAccount.accountId, pause)"
    />

    <section class="wp__sec">
      <h3 class="wp__h">Telegram</h3>
      <div class="wp__row">
        <span class="wp__label">Chat ID</span>
        <span class="wp__val wp__mono">{{ userStore.message?.telegramId || '未配置' }}</span>
      </div>
    </section>

    <section class="wp__sec">
      <h3 class="wp__h">投注账号</h3>
      <AccountBar
        embedded
        :admin-target-user-id="user.id"
        allow-pause-edit
        @pause-saved="onAdminPauseSaved"
      />
    </section>

    <section class="wp__sec">
      <h3 class="wp__h">用户配置</h3>
      <UserConfigPanel v-model:form="form" readonly />
    </section>
  </div>
</template>

<style scoped>
.wp { min-height: 400px; padding: 8px 0; }
.wp__sec { margin-bottom: 20px; }
.wp__h { margin: 0 0 8px 4px; font-size: 14px; font-weight: 600; color: var(--adm-text, #e2e8f0); }
.wp__row { display: flex; align-items: center; gap: 12px; padding: 4px 8px; font-size: 13px; }
.wp__label { color: var(--adm-text-muted, #94a3b8); min-width: 60px; }
.wp__val { color: var(--adm-text, #e2e8f0); }
.wp__mono { font-family: monospace; }
</style>
