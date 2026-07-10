<script setup lang="ts">
import type { PlatformAccount } from "@/models/platformAccount";
import { ElMessageBox } from "element-plus";

defineProps<{
  account: PlatformAccount;
  readonly?: boolean;
  preview?: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  edit: [];
  money: [];
  remove: [];
}>();

function formatBalance(value?: number) {
  if (value === undefined || Number.isNaN(value))
    return "";
  return Math.floor(value).toLocaleString();
}

function todayTagType(value: number) {
  if (value === 0)
    return undefined;
  return value > 0 ? "success" : "danger";
}

function profitPercent(account: PlatformAccount) {
  if (!account.maxProfit || !account.totalProfit)
    return 0;
  const pct = (account.totalProfit * 100) / account.maxProfit;
  return Math.min(100, Math.max(0, pct));
}

async function showPause(reason: string | false) {
  if (!reason)
    return;
  await ElMessageBox.alert(String(reason), "暂停原因");
}

async function confirmRemove() {
  try {
    await ElMessageBox.confirm("确认要删除账号吗？", "注销", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });
    emit("remove");
  }
  catch {
    /* cancelled */
  }
}
</script>

<template>
  <div
    class="account"
    :class="[
      account.provider,
      {
        pause: account.isPause(),
        loading: account.loadingBalance,
      },
    ]"
  >
    <div class="provider-icon" :class="account.provider" />
    <div class="platform" :class="{ active: account.active }">
      {{ account.platformName || account.provider }} / {{ account.venueAccountName || account.playerName || "—" }}
    </div>

    <div
      class="balance"
      :class="{
        danger:
          account.balance !== undefined
          && account.maxBalance !== 0
          && account.balance > account.maxBalance,
        error: account.balance === undefined,
      }"
    >
      <label class="currency">{{ account.currency || "CNY" }}</label>
      <template v-if="account.balance !== undefined">
        {{ formatBalance(account.balance) }}
      </template>
    </div>

    <div v-if="!readonly || preview" class="toolbar flex flex-wrap flex-center flex-middle">
      <el-button
        title="刷新"
        size="small"
        class="iconfont-base-refresh"
        :loading="account.loadingBalance"
        :disabled="preview"
        @click="emit('refresh')"
      />
      <el-button
        title="充提登记"
        size="small"
        class="iconfont-base-bank"
        :disabled="preview"
        @click="emit('money')"
      />
      <el-button
        title="编辑账号"
        size="small"
        class="iconfont-base-edit"
        @click="emit('edit')"
      />
      <el-button
        title="注销"
        size="small"
        class="am-icon-power-off"
        :disabled="preview"
        @click="confirmRemove"
      />
      <el-button
        v-if="account.isPause()"
        title="暂停原因"
        size="small"
        class="am-icon-pause-circle"
        @click="showPause(account.isPause())"
      />
    </div>

    <div class="profit flex flex-center">
      <el-tag size="small" round effect="dark" :type="todayTagType(account.today)">
        {{ account.today.toLocaleString() }}
      </el-tag>
      <el-tag v-if="account.orderCount" size="small" round style="margin-left: 6px">
        {{ account.unsettle }}/{{ account.orderCount }}
      </el-tag>
    </div>

    <div v-if="account.maxProfit" class="totalProfit">
      <el-tooltip
        class="box-item"
        effect="light"
        placement="bottom"
        :content="`当前盈利:${account.totalProfit?.toFixed(0) ?? 0}/${account.maxProfit}`"
      >
        <el-progress
          color="#f56c6c"
          :text-inside="true"
          :percentage="profitPercent(account)"
          :format="() => ''"
          style="width: 100%"
        />
      </el-tooltip>
    </div>
  </div>
</template>
