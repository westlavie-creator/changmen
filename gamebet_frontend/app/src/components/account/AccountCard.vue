<script setup lang="ts">
import type { PlatformAccount } from "@/models/platformAccount";

defineProps<{
  account: PlatformAccount;
}>();

const emit = defineEmits<{
  refresh: [];
  edit: [];
  money: [];
  remove: [];
}>();

function formatBalance(value?: number) {
  if (value === undefined || Number.isNaN(value)) return "";
  return Math.floor(value).toLocaleString();
}

function todayClass(value: number) {
  if (value === 0) return "";
  return value > 0 ? "success" : "danger";
}

function profitPercent(account: PlatformAccount) {
  if (!account.maxProfit || !account.totalProfit) return 0;
  const pct = (account.totalProfit * 100) / account.maxProfit;
  return Math.min(100, Math.max(0, pct));
}

function showPause(reason: string | false) {
  if (reason) window.alert(reason);
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
    <div v-if="account.loadingBalance" class="account-loading-mask" aria-hidden="true">
      <span class="account-loading-spinner" />
    </div>

    <div class="provider-icon" :class="account.provider" />
    <div class="platform" :class="{ active: account.active }">
      {{ account.platformName || account.provider }} / {{ account.playerName }}
    </div>

    <p v-if="account.loadingBalance" class="balance-status balance-status--loading">刷新余额…</p>
    <p v-else-if="account.balanceError" class="balance-status balance-status--error">
      {{ account.balanceError }}
    </p>

    <div
      v-else
      class="balance"
      :class="{
        danger:
          account.balance !== undefined &&
          account.maxBalance !== 0 &&
          account.balance > account.maxBalance,
        error: account.balance === undefined && !account.loadingBalance,
      }"
    >
      <label class="currency">{{ account.currency || "CNY" }}</label>
      <div
        v-if="account.balance !== undefined"
        class="balance-value"
      >
        {{ formatBalance(account.balance) }}
      </div>
    </div>

    <div class="toolbar flex flex-wrap flex-center flex-middle">
      <button
        type="button"
        class="acct-btn iconfont-base-refresh"
        title="刷新"
        :disabled="account.loadingBalance"
        @click="emit('refresh')"
      >
        ↻
      </button>
      <button type="button" class="acct-btn iconfont-base-bank" title="充提登记" @click="emit('money')">
        ¥
      </button>
      <button type="button" class="acct-btn iconfont-base-edit" title="编辑" @click="emit('edit')">
        ✎
      </button>
      <button
        type="button"
        class="acct-btn acct-btn--danger am-icon-power-off"
        title="注销"
        @click="emit('remove')"
      />
      <button
        v-if="account.isPause()"
        type="button"
        class="acct-btn am-icon-pause-circle"
        :title="String(account.isPause())"
        @click="showPause(account.isPause())"
      />
    </div>

    <div class="profit flex flex-center">
      <span class="tag" :class="todayClass(account.today)">{{ account.today.toLocaleString() }}</span>
      <span v-if="account.orderCount" class="tag tag--muted">
        {{ account.unsettle }}/{{ account.orderCount }}
      </span>
    </div>

    <div v-if="account.maxProfit" class="totalProfit">
      <div
        class="profit-bar"
        :title="`当前盈利:${account.totalProfit?.toFixed(0) ?? 0}/${account.maxProfit}`"
      >
        <div class="profit-bar__fill" :style="{ width: `${profitPercent(account)}%` }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.account {
  position: relative;
  overflow: hidden;
}

.account.loading {
  pointer-events: none;
}

.account-loading-mask {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a66;
  backdrop-filter: blur(1px);
}

.account-loading-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #64748b66;
  border-top-color: #34d399;
  border-radius: 50%;
  animation: account-spin 0.75s linear infinite;
}

.balance-status {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.3;
  min-height: 14px;
}

.balance-status--loading {
  color: #94a3b8;
}

.balance-status--error {
  color: #f87171;
  word-break: break-word;
}

.balance label.currency {
  font-size: 10px;
  margin-right: 4px;
  color: #64748b;
}

.balance-value {
  font-size: 16px;
  font-weight: 600;
}

.toolbar {
  gap: 4px;
  margin-top: 6px;
}

.acct-btn {
  border: none;
  background: #334155;
  color: #e2e8f0;
  width: 24px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

.acct-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.acct-btn--danger:hover {
  background: #7f1d1d;
}

.profit {
  gap: 6px;
  margin-top: 6px;
}

.tag {
  padding: 1px 6px;
  border-radius: 999px;
  background: #334155;
  font-size: 10px;
}

.tag.success {
  background: #065f46;
  color: #6ee7b7;
}

.tag.danger {
  background: #7f1d1d;
  color: #fca5a5;
}

.tag--muted {
  background: #1e293b;
  color: #94a3b8;
}

.totalProfit {
  margin-top: 6px;
}

.profit-bar {
  height: 4px;
  background: #334155;
  border-radius: 2px;
  overflow: hidden;
}

.profit-bar__fill {
  height: 100%;
  background: #f56c6c;
}

@keyframes account-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
