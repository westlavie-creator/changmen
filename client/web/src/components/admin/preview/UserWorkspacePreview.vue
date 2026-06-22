<script setup lang="ts">
import type { AdminOrderRow, AdminUserRow } from "@/types/admin";
import type { PlatformAccount } from "@/models/platformAccount";
import { ElMessage, ElMessageBox } from "element-plus";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { deleteAdminOrders, getAdminOrdersAll } from "@/api/admin";
import AccountCard from "@/components/account/AccountCard.vue";
import AccountEditDialog from "@/components/account/AccountEditDialog.vue";
import AdminOrderLinkLines from "@/components/admin/AdminOrderLinkLines.vue";
import OrderDateNav from "@/components/order/OrderDateNav.vue";
import OrderList from "@/components/order/OrderList.vue";
import AdminOrderLogsDialog from "@/components/admin/AdminOrderLogsDialog.vue";
import { adminPlayerLabel, groupAdminOrderEntries } from "@/shared/adminOrderDisplay";
import { todayKey } from "@/shared/dateKey";
import { useAccountStore } from "@/stores/accountStore";

import type { OrderRow } from "@/types/order";

const props = defineProps<{
  user: AdminUserRow;
}>();

defineEmits<{ viewOrders: [] }>();

const accountStore = useAccountStore();
const { sortedAccounts, editDialogOpen, editDialogAccount } = storeToRefs(accountStore);

const date = ref(todayKey());
const loading = ref(false);
const orders = ref<AdminOrderRow[]>([]);
const loadError = ref("");
const columnsContainerRef = ref<HTMLElement | null>(null);
const logsDialogRef = ref<InstanceType<typeof AdminOrderLogsDialog> | null>(null);

function ordersForAccount(acc: PlatformAccount): AdminOrderRow[] {
  return orders.value.filter(
    r => r.provider === (acc.platformName || acc.provider) && r.playerId === acc.accountId,
  );
}

function groupedForAccount(acc: PlatformAccount) {
  const rows = ordersForAccount(acc);
  return groupAdminOrderEntries(rows);
}

function orderEntriesForAccount(acc: PlatformAccount) {
  return groupedForAccount(acc).map(({ link, orderRows }) => [link, orderRows] as const);
}

function dayProfitForAccount(acc: PlatformAccount) {
  return ordersForAccount(acc).reduce((sum, r) => sum + (Number(r.money) || 0), 0);
}

function playerLabel(row: OrderRow) {
  return adminPlayerLabel(row, props.user.accounts ?? []);
}

const profitTotal = computed(() =>
  orders.value.reduce((sum, r) => sum + (Number(r.money) || 0), 0),
);

const linkLinesKey = computed(() => orders.value.length);

function fmtMoney(n: number) {
  return Math.floor(n).toLocaleString();
}

function adminRowsForLink(acc: PlatformAccount, link: number) {
  return groupedForAccount(acc).find(entry => entry.link === link)?.adminRows ?? [];
}

async function loadOrders() {
  loading.value = true;
  loadError.value = "";
  try {
    const page = await getAdminOrdersAll({ userId: props.user.id, date: date.value });
    orders.value = page.list ?? [];
  }
  catch (e) {
    orders.value = [];
    loadError.value = (e as Error).message || "加载失败";
  }
  finally {
    loading.value = false;
  }
}

async function onDeleteOrders(rows: AdminOrderRow[]) {
  if (!rows.length)
    return;
  const ids = rows.map(r => r.id);
  const label = rows.length > 1
    ? `这 ${rows.length} 笔套利订单（Link ${rows[0]?.linkId || "—"}）`
    : `订单 ${rows[0]?.orderId || ids[0]}`;
  try {
    await ElMessageBox.confirm(`确认删除 ${label}？此操作不可恢复。`, "删除订单", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  }
  catch {
    return;
  }
  try {
    const res = await deleteAdminOrders(ids);
    ElMessage.success(`已删除 ${res.deleted} 笔订单`);
    await loadOrders();
  }
  catch (e) {
    ElMessage.error((e as Error).message || "删除失败");
  }
}

function openLogs(rows: AdminOrderRow[]) {
  logsDialogRef.value?.open(rows);
}

watch(date, () => void loadOrders());
watch(() => props.user.id, () => void loadOrders());

onMounted(() => void loadOrders());
</script>

<template>
  <div class="user-workspace-preview" v-loading="loading">
    <AccountEditDialog
      :open="editDialogOpen"
      :account="editDialogAccount"
      readonly
      @close="accountStore.closeAccountDialog()"
    />

    <div class="user-workspace-preview__toolbar">
      <OrderDateNav v-model="date" placeholder="日期" />
      <el-button size="small" @click="loadOrders">
        刷新
      </el-button>
      <span v-if="orders.length" class="user-workspace-preview__summary">
        {{ sortedAccounts.length }} 个账号 · {{ orders.length }} 笔订单 ·
        利润
        <span :class="{ pos: profitTotal > 0, neg: profitTotal < 0 }">{{ fmtMoney(profitTotal) }}</span>
      </span>
    </div>

    <p v-if="loadError" class="user-workspace-preview__err">
      {{ loadError }}
    </p>

    <div
      v-if="sortedAccounts.length"
      ref="columnsContainerRef"
      class="workspace-columns"
    >
      <div
        v-for="acc in sortedAccounts"
        :key="acc.accountId"
        class="workspace-col"
      >
        <AccountCard
          :account="acc"
          preview
          class="workspace-col__card"
          @edit="accountStore.openEditAccount(acc)"
        />
        <div class="workspace-col__orders">
          <div v-if="!orderEntriesForAccount(acc).length" class="workspace-col__empty">
            暂无订单
          </div>
          <OrderList
            v-else
            :order-entries="orderEntriesForAccount(acc)"
            :player-label="playerLabel"
          >
            <template #group-actions="{ link }">
              <div class="workspace-col__actions">
                <el-button link type="primary" size="small" @click="openLogs(adminRowsForLink(acc, link))">
                  诊断
                </el-button>
                <el-button link type="danger" size="small" @click="onDeleteOrders(adminRowsForLink(acc, link))">
                  删除
                </el-button>
              </div>
            </template>
          </OrderList>
          <div v-if="ordersForAccount(acc).length" class="workspace-col__profit-row">
            <span
              :class="{ pos: dayProfitForAccount(acc) > 0, neg: dayProfitForAccount(acc) < 0 }"
            >{{ fmtMoney(dayProfitForAccount(acc)) }}</span>
            <span class="workspace-col__count">{{ ordersForAccount(acc).length }} 笔</span>
          </div>
        </div>
      </div>

      <AdminOrderLinkLines
        :container-ref="columnsContainerRef"
        :key="linkLinesKey"
      />
    </div>

    <p v-if="!loading && !loadError && !sortedAccounts.length" class="user-workspace-preview__empty">
      {{ date }} 暂无订单
    </p>

    <AdminOrderLogsDialog ref="logsDialogRef" />
  </div>
</template>

<style scoped>
.user-workspace-preview {
  min-height: 400px;
  overflow-x: auto;
}
.user-workspace-preview__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px 12px;
}
.user-workspace-preview__summary {
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
.user-workspace-preview__empty {
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
  margin: 40px 0;
}

.workspace-columns {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 12px;
  width: max-content;
  min-width: 100%;
  padding-bottom: 12px;
  position: relative;
  overflow-x: auto;
}
.workspace-col {
  flex: 0 0 260px;
  width: 260px;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--adm-border, rgba(255,255,255,0.08));
  border-radius: 6px;
  background: var(--adm-surface-2, rgba(255,255,255,0.02));
}
.workspace-col__card {
  flex-shrink: 0;
}
.workspace-col__orders {
  flex: 1 1 auto;
  padding: 6px;
  font-size: 12px;
}
.workspace-col__empty {
  padding: 20px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--adm-text-muted, #64748b);
}
.workspace-col__actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  padding: 0 4px 4px;
}
.workspace-col__profit-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border-top: 1px solid var(--adm-border, rgba(255,255,255,0.08));
  font-size: 13px;
  font-weight: 600;
}
.workspace-col__count {
  font-size: 11px;
  font-weight: normal;
  color: var(--adm-text-muted, #64748b);
}
</style>
