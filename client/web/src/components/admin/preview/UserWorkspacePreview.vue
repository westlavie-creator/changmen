<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { AdminUserRow } from "@/types/admin";
import { PlatformAccount } from "@/models/platformAccount";
import UserConfigPanel from "@/components/user/UserConfigPanel.vue";
import AccountEditPanel from "@/components/account/AccountEditPanel.vue";
import EmbeddedUserDialog from "@/components/admin/preview/EmbeddedUserDialog.vue";
import UserInfoPanelPreview from "@/components/admin/preview/UserInfoPanelPreview.vue";
import AccountBarPreview from "@/components/admin/preview/AccountBarPreview.vue";
import {
  adminAccountToPlatformAccount,
  buildAdminAccountDisplayRows,
} from "@/components/admin/adminAccountDisplay";
import { createAccountEditFormStateFromPlatformAccount } from "@/components/account/accountEditFormState";
import { createUserConfigFormState } from "@/components/user/userConfigFormState";
import { mergeUserConfig, type UserConfig } from "@/types/userConfig";

const props = defineProps<{
  user: AdminUserRow;
}>();

const emit = defineEmits<{ viewOrders: [] }>();

const configPanelOpen = ref(false);
const accountPanelOpen = ref(false);

const configForm = reactive(createUserConfigFormState(mergeUserConfig({})));
const accountForm = reactive(
  createAccountEditFormStateFromPlatformAccount(
    new PlatformAccount({ accountId: 0, playerName: "", provider: "RAY" }),
  ),
);
const accountProxyOptions = ref<{ label: string; value: number }[]>([{ label: "无代理", value: 0 }]);

const displayAccounts = computed(() =>
  (props.user.accounts ?? [])
    .map(adminAccountToPlatformAccount)
    .sort(PlatformAccount.sortByProvider),
);

const accountDisplayRows = computed(() => buildAdminAccountDisplayRows(props.user.accounts ?? []));

const accountRowMap = computed(
  () => new Map(accountDisplayRows.value.map((row) => [row.accountId, row])),
);

const totalBalance = computed(() =>
  displayAccounts.value.reduce((sum, acc) => sum + (acc.getBalance() ?? 0), 0),
);

const bettingOn = computed(() =>
  Boolean(mergeUserConfig(props.user.setting as Partial<UserConfig>).betting),
);

function openConfigPanel() {
  Object.assign(
    configForm,
    createUserConfigFormState(mergeUserConfig(props.user.setting as Partial<UserConfig>)),
  );
  configPanelOpen.value = true;
  accountPanelOpen.value = false;
}

function openAccountEdit(account: PlatformAccount) {
  const row = accountRowMap.value.get(account.accountId);
  if (!row) return;
  Object.assign(accountForm, structuredClone(row.form));
  accountProxyOptions.value = row.proxyOptions;
  accountPanelOpen.value = true;
  configPanelOpen.value = false;
}
</script>

<template>
  <div class="user-workspace-preview">
    <el-container class="common-layout home-view">
      <el-aside width="260px">
        <div class="app-sidebar">
          <UserInfoPanelPreview
            :user-name="user.userName"
            :total-balance="totalBalance"
            :total-today="user.todayMoney"
            :total-orders="user.todayCount"
            :betting="bettingOn"
            @open-config="openConfigPanel"
            @view-orders="emit('viewOrders')"
          />
          <div class="date flex flex-center user-workspace-preview__orders-bar">
            <el-input size="small" disabled model-value="今日" style="width: 92px" />
            <el-select placeholder="Select" size="small" style="width: 160px" disabled />
            <el-button class="am-icon-refresh" size="small" disabled />
          </div>
          <div class="orders user-workspace-preview__orders-empty">
            <p>侧栏订单为该用户会话实时数据，请使用「查看订单」查看历史订单。</p>
          </div>
        </div>
      </el-aside>

      <el-container>
        <el-header>
          <AccountBarPreview :accounts="displayAccounts" @edit="openAccountEdit" />
        </el-header>
        <el-main class="user-workspace-preview__main">
          <EmbeddedUserDialog
            v-if="configPanelOpen"
            title="参数配置"
            width="1000px"
            @close="configPanelOpen = false"
          >
            <UserConfigPanel :form="configForm" readonly />
          </EmbeddedUserDialog>

          <EmbeddedUserDialog
            v-else-if="accountPanelOpen"
            title="平台账号设置"
            width="800px"
            @close="accountPanelOpen = false"
          >
            <AccountEditPanel
              :form="accountForm"
              readonly
              hide-sensitive
              game-expanded
              :proxy-options="accountProxyOptions"
            />
          </EmbeddedUserDialog>

          <p v-else class="user-workspace-preview__hint">
            点击侧栏齿轮查看「参数配置」，点击账号卡「编辑」查看「平台账号设置」。
          </p>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<style scoped>
.user-workspace-preview__orders-bar {
  margin-top: 8px;
  opacity: 0.72;
}
.user-workspace-preview__orders-empty {
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #ffffff8c;
}
.user-workspace-preview__orders-empty p {
  margin: 0;
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
</style>
