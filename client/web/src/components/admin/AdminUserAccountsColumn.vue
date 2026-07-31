<script setup lang="ts">
import type { AdminAccountListRow } from "@/types/admin";
import { computed } from "vue";
import PlatformIcon from "@/components/platform/PlatformIcon.vue";

const props = defineProps<{
  userName: string;
  accounts: AdminAccountListRow[];
}>();

const emit = defineEmits<{
  edit: [row: AdminAccountListRow];
  orders: [row: AdminAccountListRow];
  user: [row: AdminAccountListRow];
}>();

function isDeleted(row: AdminAccountListRow) {
  return Boolean(row.deleted) || row.deletedAt != null;
}

const activeAccounts = computed(() => props.accounts.filter(r => !isDeleted(r)));
const deletedAccounts = computed(() => props.accounts.filter(r => isDeleted(r)));

const todaySum = computed(() =>
  activeAccounts.value.reduce((s, r) => s + (Number(r.today) || 0), 0),
);

const pausedCount = computed(() =>
  activeAccounts.value.filter(r => r.pause).length,
);

function isPredictFunRow(row: AdminAccountListRow) {
  return String(row.platform || "") === "PredictFun";
}

function memberLabel(row: AdminAccountListRow) {
  if (row.platform === "PredictFun")
    return row.playerName || row.userName || "—";
  return row.venueAccountName || row.playerName || "—";
}

function fmtMoney(n: number | undefined) {
  if (n == null || Number.isNaN(Number(n)))
    return "—";
  return Math.floor(Number(n)).toLocaleString();
}

function moneyClass(n: number | undefined) {
  const v = Number(n) || 0;
  if (v > 0)
    return "pos";
  if (v < 0)
    return "neg";
  return "";
}

function balanceOf(row: AdminAccountListRow) {
  return isPredictFunRow(row) ? row.balance : row.credit;
}

function fmtDeletedAt(ms: number | null | undefined) {
  const n = Number(ms) || 0;
  if (!n)
    return "";
  return new Date(n).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function goUserFromCol() {
  const row = activeAccounts.value[0] || deletedAccounts.value[0];
  if (row)
    emit("user", row);
}
</script>

<template>
  <div class="admin-accounts-user-col">
    <header class="admin-accounts-user-col__head">
      <button
        type="button"
        class="admin-accounts-user-col__name admin-link-btn"
        @click="goUserFromCol"
      >
        {{ userName }}
      </button>
      <span
        class="admin-accounts-user-col__today"
        :class="moneyClass(todaySum)"
      >
        今日 {{ fmtMoney(todaySum) }}
      </span>
      <span class="admin-accounts-user-col__meta">
        {{ activeAccounts.length }} 个账号
        <template v-if="pausedCount">
          · {{ pausedCount }} 暂停
        </template>
        <template v-if="deletedAccounts.length">
          · {{ deletedAccounts.length }} 已删
        </template>
      </span>
    </header>

    <div
      v-if="!activeAccounts.length && !deletedAccounts.length"
      class="admin-accounts-user-col__empty"
    >
      暂无子账号
    </div>

    <template v-else>
      <ul v-if="activeAccounts.length" class="admin-accounts-user-col__list">
        <li
          v-for="row in activeAccounts"
          :key="`${row.userId}-${row.accountId}`"
          class="admin-accounts-card"
          :class="{ 'is-paused': row.pause }"
        >
          <div class="admin-accounts-card__row admin-accounts-card__row--title">
            <PlatformIcon :platform="row.platform" />
            <span class="admin-accounts-card__title" :title="`${row.platform} / ${memberLabel(row)}`">
              {{ row.platform || "—" }} / {{ memberLabel(row) }}
            </span>
            <span class="admin-accounts-card__id">#{{ row.accountId }}</span>
            <el-tag v-if="row.pause" type="danger" size="small" effect="plain">
              停
            </el-tag>
            <button type="button" class="admin-accounts-card__link" @click="emit('edit', row)">
              编辑
            </button>
            <button type="button" class="admin-accounts-card__link" @click="emit('orders', row)">
              订单
            </button>
          </div>
          <div class="admin-accounts-card__row admin-accounts-card__row--nums">
            <span>余额 {{ fmtMoney(balanceOf(row)) }}</span>
            <span>上限 {{ fmtMoney(row.maxBalance) }}</span>
            <span>×{{ row.multiply ?? "—" }}</span>
          </div>
          <div class="admin-accounts-card__row admin-accounts-card__row--nums">
            <span>
              今日
              <b :class="moneyClass(row.today)">{{ fmtMoney(row.today) }}</b>
            </span>
            <span>
              累计
              <b :class="moneyClass(row.totalProfit)">{{ fmtMoney(row.totalProfit) }}</b>
            </span>
          </div>
        </li>
      </ul>

      <div v-if="deletedAccounts.length" class="admin-accounts-user-col__deleted">
        <div class="admin-accounts-user-col__deleted-head">
          已软删 {{ deletedAccounts.length }}
        </div>
        <ul class="admin-accounts-user-col__list admin-accounts-user-col__list--deleted">
          <li
            v-for="row in deletedAccounts"
            :key="`del-${row.userId}-${row.accountId}`"
            class="admin-accounts-card is-deleted"
          >
            <div class="admin-accounts-card__row admin-accounts-card__row--title">
              <PlatformIcon :platform="row.platform" />
              <span class="admin-accounts-card__title" :title="`${row.platform} / ${memberLabel(row)}`">
                {{ row.platform || "—" }} / {{ memberLabel(row) }}
              </span>
              <span class="admin-accounts-card__id">#{{ row.accountId }}</span>
              <el-tag type="info" size="small" effect="plain">
                已删
              </el-tag>
              <button type="button" class="admin-accounts-card__link" @click="emit('orders', row)">
                订单
              </button>
            </div>
            <div class="admin-accounts-card__row admin-accounts-card__row--nums">
              <span v-if="fmtDeletedAt(row.deletedAt)">删于 {{ fmtDeletedAt(row.deletedAt) }}</span>
              <span v-if="row.description" class="admin-accounts-card__desc" :title="row.description">
                {{ row.description }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
