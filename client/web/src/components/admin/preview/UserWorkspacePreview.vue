<script setup lang="ts">
import type { AdminUserRow } from "@/types/admin";
import { ADMIN_SETTING_LABELS } from "@/components/admin/adminSettingLabels";
import { storeToRefs } from "pinia";
import { ElMessage } from "element-plus";
import { reactive, ref, watch } from "vue";
import { updateAdminUserBetTarget } from "@/api/admin";
import AccountBar from "@/components/account/AccountBar.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import { createUserConfigFormState } from "@/components/user/userConfigFormState";
import UserConfigPanel from "@/components/user/UserConfigPanel.vue";
import { useAccountStore } from "@/stores/accountStore";
import { useUserStore } from "@/stores/userStore";

const props = defineProps<{ user: AdminUserRow }>();
defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const userStore = useUserStore();
const { editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

let form = reactive(createUserConfigFormState(userStore.config));
watch(() => userStore.config, c => Object.assign(form, createUserConfigFormState(c)));

const betTarget = ref(Boolean(props.user.setting?.BetTarget));
const betTargetSaving = ref(false);

watch(
  () => props.user.setting?.BetTarget,
  (value) => {
    betTarget.value = Boolean(value);
  },
);

async function onBetTargetChange(enabled: boolean) {
  if (!userStore.isAdmin)
    return;
  const previous = Boolean(props.user.setting?.BetTarget);
  betTargetSaving.value = true;
  try {
    const result = await updateAdminUserBetTarget(props.user.id, enabled);
    if (!props.user.setting)
      props.user.setting = {};
    props.user.setting.BetTarget = Boolean(result.setting?.BetTarget);
    betTarget.value = Boolean(result.setting?.BetTarget);
    ElMessage.success(
      betTarget.value ? "已开启投注目标（操盘 Tab）" : "已关闭投注目标",
    );
  }
  catch (err) {
    betTarget.value = previous;
    ElMessage.error(err instanceof Error ? err.message : "保存失败");
  }
  finally {
    betTargetSaving.value = false;
  }
}

function onAdminMultiplySaved(multiply: number) {
  const acc = editDialogAccount.value;
  if (!acc)
    return;
  const row = props.user.accounts?.find(a => a.accountId === acc.accountId);
  if (row)
    row.multiply = multiply;
}

</script>

<template>
  <div class="wp">
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      :admin-target-user-id="user.id"
      allow-multiply-edit
      readonly
      @close="accountStore.closeAccountDialog()"
      @multiply-saved="onAdminMultiplySaved"
    />

    <section v-if="userStore.isAdmin" class="wp__sec">
      <h3 class="wp__h">
        功能开关
      </h3>
      <el-form label-width="100px" class="wp__feature-form">
        <el-form-item :label="ADMIN_SETTING_LABELS.BetTarget">
          <el-switch
            v-model="betTarget"
            :loading="betTargetSaving"
            @change="onBetTargetChange"
          />
          <span class="wp__hint">开启后用户可见「操盘」Tab，并可同步 BetTarget 广播</span>
        </el-form-item>
      </el-form>
    </section>

    <section class="wp__sec">
      <h3 class="wp__h">Telegram</h3>
      <div class="wp__row">
        <span class="wp__label">Chat ID</span>
        <span class="wp__val wp__mono">{{ userStore.message?.telegramId || '未配置' }}</span>
      </div>
    </section>

    <section class="wp__sec">
      <h3 class="wp__h">投注账号</h3>
      <AccountBar embedded />
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
.wp__hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--adm-text-muted, #94a3b8);
}
.wp__feature-form :deep(.el-form-item) {
  margin-bottom: 0;
}
</style>
